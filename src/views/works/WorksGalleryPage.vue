<script setup lang="ts">
/**
 * WorksGalleryPage - 作品库广场。
 *
 * 这页唯一的工作动词是「找图 → 一键同款」。所以：
 * - 图 = 唯一的表面。卡片不再分「图区 + 文字区」两段，标题/作者/模式/社交数值全部
 *   压在图片底部的渐变字幕带上，同样的屏幕高度能多看一排图。
 * - 检索面（范围 / 关键词 / 模式 / 标签 / 排序）全部上提到页头 #filters，
 *   永不滚走；标签作为带 usage_count 的分面常驻成一条 chip 轨，点了就变高亮，
 *   用户随时知道结果集有多大、哪个筛选生效中。
 * - 高频动作（同款、点赞、收藏）留在图上；复制提示词 / 详情收进 kebab。
 *
 * 注意：懒加载哨兵的 IntersectionObserver 根依赖 PageLayout 的 `.page-content`，
 * 滚动必须留在 .page-content 上，页面内不得再套一层 overflow 容器。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { worksApi } from '@/services/worksApi'
import type { WorkItem, WorkListParams } from '@/services/worksApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import {
  Search, Bookmark, RefreshCw, Image as ImageIcon, LoaderCircle, ThumbsUp, Copy,
  Ellipsis, Wand2, X, TriangleAlert, ListFilter,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { UiEmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

defineOptions({ name: 'WorksGalleryPage' })

const router = useRouter()
const { error, info, success } = useUiFeedback()
const { retryOnError } = useImageRetry()

const scope = ref<'gallery' | 'mine' | 'favorites'>('gallery')
const loading = ref(false)
const works = ref<WorkItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(24)
const noMore = ref(false) // 已加载到末尾
const loadingMore = ref(false) // 正在加载下一页
// 仅 UI：首屏加载失败时给出可重试的落点（原来只有一条 toast，页面会停在空白）
const loadFailed = ref(false)

// 筛选
const sort = ref<'latest' | 'hot' | 'most_reused'>('latest')
const featureId = ref('')
const tagId = ref<number | undefined>(undefined)
const keyword = ref('')

const tags = ref<{ id: number; name: string; usage_count: number }[]>([])

const scopeOptions = [
  { value: 'gallery', label: '广场' },
  { value: 'mine', label: '我发布的' },
  { value: 'favorites', label: '我的收藏' },
]

// reka Select 的 value 不能是空串，用哨兵表达「全部模式」（下发时仍还原为不下发该筛选）
const ALL_FEATURE = '__all__'
const featureOptions = Object.keys(FEATURE_CONFIGS).map((k) => ({
  id: k,
  label: FEATURE_CONFIGS[k].label,
}))

const sortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '最热' },
  { value: 'most_reused', label: '最多复用' },
]

// ─── 仅 UI：从已有字段派生的展示信息 ───
function featureLabel(id: string | null): string {
  if (!id || id === 'free-gen') return '自由生图'
  return FEATURE_CONFIGS[id]?.label || id
}

/** 卡片的标题位：作品备注 → 用户提示词 → 完整提示词首行 */
function workTitle(work: WorkItem): string {
  const remark = work.remark?.trim()
  if (remark) return remark
  const userPrompt = work.user_prompt?.trim()
  if (userPrompt) return userPrompt.split('\n')[0]
  const prompt = work.prompt?.trim()
  if (prompt) return prompt.split('\n')[0]
  return '未命名作品'
}

function authorLabel(work: WorkItem): string {
  return work.author?.nickname || work.author?.username || '匿名'
}

const activeFilterCount = computed(() =>
  (featureId.value ? 1 : 0) + (tagId.value ? 1 : 0) + (keyword.value.trim() ? 1 : 0),
)
/** 分面轨按使用量排序：常用标签离「全部」更近，冷标签自动沉底 */
const displayTags = computed(() => [...tags.value].sort((a, b) => b.usage_count - a.usage_count))
const emptyTitle = computed(() => {
  if (keyword.value.trim()) return `没有匹配「${keyword.value.trim()}」的作品`
  if (activeFilterCount.value) return '当前筛选条件下没有作品'
  return scope.value === 'gallery' ? '还没有作品' : '这里还是空的'
})
const emptyDescription = computed(() => {
  if (scope.value === 'favorites') return '在作品卡上点收藏，就会沉淀到这里。'
  if (scope.value === 'mine') return '在生成结果里把好图发布到广场，即可在此展示。'
  return '换个关键词或清除筛选试试，稍后也会有新作品上架。'
})

function onFeatureChange(value: string) {
  featureId.value = value === ALL_FEATURE ? '' : value
  applyFilters()
}

function clearFilters() {
  keyword.value = ''
  featureId.value = ''
  tagId.value = undefined
  applyFilters()
}

// 懒加载哨兵元素 & IntersectionObserver
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function loadWorks() {
  loading.value = true
  page.value = 1
  noMore.value = false
  try {
    const params: WorkListParams = {
      page: page.value,
      pageSize: pageSize.value,
      sort: sort.value,
      scope: scope.value,
    }
    if (featureId.value) params.feature_id = featureId.value
    if (tagId.value) params.tag_id = tagId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()

    const res = await worksApi.list(params)
    works.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
    noMore.value = works.value.length >= total.value
    loadFailed.value = false
  } catch (e) {
    error(e, '加载作品列表失败')
    loadFailed.value = true
  } finally {
    loading.value = false
    nextTick(setupObserver)
  }
}

async function loadMore() {
  if (loadingMore.value || noMore.value || loading.value) return
  loadingMore.value = true
  try {
    const nextPage = page.value + 1
    const params: WorkListParams = {
      page: nextPage,
      pageSize: pageSize.value,
      sort: sort.value,
      scope: scope.value,
    }
    if (featureId.value) params.feature_id = featureId.value
    if (tagId.value) params.tag_id = tagId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()

    const res = await worksApi.list(params)
    const records = res.data.data?.records || []
    works.value.push(...records)
    page.value = nextPage
    total.value = res.data.data?.total || 0
    noMore.value = works.value.length >= total.value
  } catch (e) {
    error(e, '加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

// 设置 IntersectionObserver 监听哨兵元素
function setupObserver() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  const el = sentinelRef.value
  if (!el) return
  // 找到滚动容器（.page-content）
  const root = el.closest('.page-content') as HTMLElement | null
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) loadMore()
    },
    { root, rootMargin: '300px', threshold: 0 },
  )
  observer.observe(el)
}

function applyFilters() {
  loadWorks()
}

function openDetail(work: WorkItem) {
  router.push(`/works/${work.id}`)
}

// 卡片内操作（阻止冒泡，避免触发 openDetail）
async function toggleLike(work: WorkItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await worksApi.like(work.id)
    work.is_liked = res.data.data.is_liked
    work.like_count = res.data.data.like_count
  } catch (e) {
    error(e, '操作失败')
  }
}

async function toggleFavorite(work: WorkItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await worksApi.favorite(work.id)
    work.is_favorited = res.data.data.is_favorited
    work.favorite_count = res.data.data.favorite_count
    success(work.is_favorited ? '已收藏' : '已取消收藏')
  } catch (e) {
    error(e, '操作失败')
  }
}

function copyPrompt(work: WorkItem, e: Event) {
  e.stopPropagation()
  if (!work.prompt) return
  navigator.clipboard.writeText(work.prompt).then(() => success('已复制提示词')).catch(() => error(new Error(), '复制失败，请手动复制'))
}

async function handleReuse(work: WorkItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await worksApi.reuse(work.id)
    const data = res.data.data
    const featureId = data.feature_id
    const isPhotography = featureId === 'ai-photography'
    const isFreeGen = !featureId || featureId === 'free-gen'
    const targetRoutePath = isPhotography ? '/photography' : isFreeGen ? '/free-gen' : '/workspace'

    sessionStorage.setItem('regenerate_task', JSON.stringify({
      model: data.model,
      prompt: data.prompt,
      resolution: data.resolution,
      aspectRatio: data.aspectRatio,
      userPrompt: data.userPrompt || '',
      input_image_urls: data.input_image_urls || [],
      feature_id: featureId,
    }))
    router.push(targetRoutePath)
    info(
      isPhotography ? '已跳转到AI摄影，参数已复制'
      : isFreeGen ? '已跳转到自由生图，请点击生成按钮'
      : '已跳转到工作台，请点击生成按钮'
    )
  } catch (e) {
    error(e, '一键同款失败')
  }
}

onMounted(() => {
  loadTags()
  loadWorks()
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

async function loadTags() {
  try {
    const res = await worksApi.tags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}
</script>

<template>
  <PageLayout
    title="作品库"
    subtitle="广场上的公开作品。看中哪张直接「一键同款」，参数会带回生成页。"
  >
    <template #extra>
      <!-- 范围是这张页最高层的分面，用分段控件常驻页头 -->
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        :model-value="scope"
        @update:model-value="(v) => { if (v) { scope = String(v) as typeof scope; applyFilters() } }"
      >
        <ToggleGroupItem v-for="s in scopeOptions" :key="s.value" :value="s.value">{{ s.label }}</ToggleGroupItem>
      </ToggleGroup>
    </template>

    <!-- 检索行：永不滚走，并且随时反馈结果集体量 -->
    <template #filters>
      <div class="relative w-60 max-w-full">
        <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          v-model="keyword"
          placeholder="搜索标题或提示词"
          aria-label="搜索作品"
          class="h-8 pr-7 pl-8 text-[13px]"
          @keyup.enter="applyFilters"
        />
        <button
          v-if="keyword"
          type="button"
          aria-label="清除关键词"
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
          @click="keyword = ''; applyFilters()"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <Select :model-value="featureId || ALL_FEATURE" @update:model-value="(v) => onFeatureChange(String(v))">
        <SelectTrigger class="h-8 w-34 text-[13px]" aria-label="按生成模式筛选">
          <SelectValue placeholder="全部模式" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_FEATURE">全部模式</SelectItem>
          <SelectItem v-for="f in featureOptions" :key="f.id" :value="f.id">{{ f.label }}</SelectItem>
        </SelectContent>
      </Select>

      <div class="flex items-center gap-1.5">
        <span class="text-muted-foreground text-[12px]">排序</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          :model-value="sort"
          @update:model-value="(v) => { if (v) { sort = String(v) as typeof sort; applyFilters() } }"
        >
          <ToggleGroupItem v-for="s in sortOptions" :key="s.value" :value="s.value">{{ s.label }}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <span class="text-muted-foreground text-[12px] tabular-nums">
          共 {{ total }} 件<span v-if="works.length && works.length < total">，已加载 {{ works.length }}</span>
        </span>
        <Button variant="ghost" size="icon-sm" title="刷新" aria-label="刷新" :disabled="loading" @click="loadWorks">
          <RefreshCw class="size-4" :class="cn('transition-transform', loading && 'animate-spin')" />
        </Button>
      </div>

      <!-- 标签分面轨：带使用量计数，选中态即「此筛选生效中」 -->
      <div v-if="displayTags.length" class="flex basis-full flex-wrap items-center gap-1.5 border-t pt-2.5">
        <ListFilter class="text-muted-foreground size-3.5 shrink-0" />
        <button
          type="button"
          class="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] transition-colors"
          :class="cn(
            tagId === undefined
              ? 'bg-foreground text-background font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )"
          @click="tagId = undefined; applyFilters()"
        >全部标签</button>
        <button
          v-for="t in displayTags"
          :key="t.id"
          type="button"
          class="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] transition-colors"
          :class="cn(
            tagId === t.id
              ? 'bg-foreground text-background font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )"
          @click="tagId = t.id; applyFilters()"
        >
          <span class="truncate">{{ t.name }}</span>
          <span class="text-[11px] tabular-nums opacity-70">{{ t.usage_count }}</span>
        </button>
        <button
          v-if="activeFilterCount"
          type="button"
          class="text-muted-foreground hover:text-foreground ml-1 flex cursor-pointer items-center gap-1 text-[12px] underline decoration-border underline-offset-4 transition-colors"
          @click="clearFilters"
        >
          <X class="size-3" />清除 {{ activeFilterCount }} 项筛选
        </button>
      </div>
      <button
        v-else-if="activeFilterCount"
        type="button"
        class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-[12px] underline decoration-border underline-offset-4 transition-colors"
        @click="clearFilters"
      >
        <X class="size-3" />清除 {{ activeFilterCount }} 项筛选
      </button>
    </template>

    <!-- 首屏加载失败 -->
    <div
      v-if="loadFailed && !loading && works.length === 0"
      class="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center"
    >
      <TriangleAlert class="text-destructive size-6" :stroke-width="1.5" />
      <p class="text-[13px] font-medium">作品列表加载失败</p>
      <Button size="sm" variant="outline" class="mt-1 gap-1.5" @click="loadWorks">
        <RefreshCw class="size-3.5" />重试
      </Button>
    </div>

    <div v-else>
      <!-- 骨架屏 -->
      <div v-if="loading && works.length === 0" class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
        <Skeleton v-for="i in 12" :key="`sk-${i}`" class="aspect-3/4 w-full rounded-lg" />
      </div>

      <!-- 空态 -->
      <UiEmptyState v-else-if="works.length === 0" :title="emptyTitle" :description="emptyDescription">
        <Button v-if="activeFilterCount" size="sm" variant="outline" class="gap-1.5" @click="clearFilters">
          <X class="size-3.5" />清除筛选
        </Button>
      </UiEmptyState>

      <!-- 图块即整张卡：文字压在图上的字幕带里，不再额外占一段卡体 -->
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
        <article
          v-for="work in works"
          :key="work.id"
          class="group relative aspect-3/4 cursor-pointer overflow-hidden rounded-lg border bg-muted transition-colors hover:border-input"
          @click="openDetail(work)"
        >
          <img
            v-if="work.image_url"
            :src="work.image_url"
            :alt="workTitle(work)"
            loading="lazy"
            class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            @error="retryOnError($event, work.image_url)"
          />
          <div v-else class="flex size-full items-center justify-center">
            <ImageIcon class="text-muted-foreground/50 size-8" />
          </div>

          <Badge
            v-if="work.is_official"
            variant="warning"
            class="absolute top-1.5 left-1.5 z-10 h-5 border border-border/60 text-[11px]"
          >官方</Badge>
          <span
            v-if="featureLabel(work.feature_id)"
            class="absolute top-1.5 right-1.5 z-10 rounded bg-black/45 px-1.5 py-0.5 text-[11px] text-white/90"
          >{{ featureLabel(work.feature_id) }}</span>

          <!-- 字幕带：标题 / 作者 / 社交数值（常驻） -->
          <div class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-2 pt-8 pb-1.5">
            <p class="truncate text-[13px] leading-5 font-medium text-white" :title="workTitle(work)">
              {{ workTitle(work) }}
            </p>
            <p class="text-white/70 flex min-w-0 items-center gap-1.5 text-[11px]">
              <span class="truncate">{{ authorLabel(work) }}</span>
            </p>
            <div class="pointer-events-auto flex items-center gap-0.5">
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] text-white/80 tabular-nums transition-colors hover:bg-white/15 hover:text-white"
                :class="work.is_liked && 'text-white font-medium'"
                :title="work.is_liked ? '取消今日点赞' : '点赞（每天可赞一次）'"
                :aria-pressed="work.is_liked"
                @click="toggleLike(work, $event)"
              >
                <ThumbsUp class="size-3.5" :class="work.is_liked && 'fill-current'" />
                {{ work.like_count }}
              </button>
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] text-white/80 tabular-nums transition-colors hover:bg-white/15 hover:text-white"
                :class="work.is_favorited && 'text-white font-medium'"
                :title="work.is_favorited ? '取消收藏' : '收藏'"
                :aria-pressed="work.is_favorited"
                @click="toggleFavorite(work, $event)"
              >
                <Bookmark class="size-3.5" :class="work.is_favorited && 'fill-current'" />
                {{ work.favorite_count }}
              </button>
              <span
                class="text-white/60 flex items-center gap-1 px-1 py-0.5 text-[11px] tabular-nums"
                :title="`被同款 ${work.reuse_count} 次`"
              >
                <Copy class="size-3.5" />{{ work.reuse_count }}
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    class="hover:bg-white/15 ml-auto size-6 text-white/80 hover:text-white"
                    title="更多操作"
                    aria-label="更多操作"
                    @click.stop
                  >
                    <Ellipsis class="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-40" @click.stop>
                  <DropdownMenuItem @click="copyPrompt(work, $event)">
                    <Copy />复制提示词
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem @click="openDetail(work)">
                    <Search />查看作品详情
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <!-- 悬停/键盘聚焦才现身的主操作 -->
          <div class="pointer-events-none absolute inset-x-0 top-1/2 flex items-center justify-center px-2 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <Button
              size="sm"
              class="w-full gap-1.5 shadow-sm"
              title="带着这张图的参数再生成一次"
              @click="handleReuse(work, $event)"
            >
              <Wand2 class="size-3.5" />一键同款
            </Button>
          </div>
        </article>
      </div>

      <!-- 懒加载哨兵 + 加载状态 -->
      <div v-if="works.length > 0" class="py-5">
        <div ref="sentinelRef" class="h-px" />
        <div v-if="loadingMore" class="text-muted-foreground flex items-center justify-center gap-2 text-[12px]">
          <LoaderCircle class="size-4 animate-spin" />正在加载更多…
        </div>
        <div v-else-if="!noMore" class="flex justify-center py-1">
          <Button variant="outline" size="sm" class="gap-1.5" @click="loadMore">
            <RefreshCw class="size-3.5" />继续加载
          </Button>
        </div>
        <p v-else class="text-muted-foreground/70 py-1 text-center text-[11px]">
          已经到底了 · 共 {{ works.length }} 件作品
        </p>
      </div>
    </div>
  </PageLayout>
</template>
