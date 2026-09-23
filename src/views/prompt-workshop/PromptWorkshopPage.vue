<script setup lang="ts">
/**
 * PromptWorkshopPage - 提示词工坊（重构版）。
 *
 * 左侧：结构化提示词卡片社区库（瀑布流 + 筛选 + 互动按钮）。
 * 右侧：拼接预览面板，点击卡片「复用」把内容追加进来；
 *       要求固定首段、禁止出现固定末段、元素按添加顺序、换行分隔。
 *       textarea 可手动编辑；底部三个按钮（重置/复制/保存到私有库）。
 *
 * 卡片结构：模块 + 内容 + 多图（1~10，可置顶）+ 备注。
 */
defineOptions({ name: 'PromptWorkshopPage' })
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import PromptCardUpload from '@/components/prompt-workshop/PromptCardUpload.vue'
import PromptCardPreview from '@/components/prompt-workshop/PromptCardPreview.vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { usePromptLibrary } from '@/composables/usePromptLibrary'
import { promptLibraryApi } from '@/services/promptLibraryApi'
import { promptCardsApi, type PromptCardItem, type PromptModule, type PromptCardListParams } from '@/services/promptCardsApi'
import { appendSegmentToText, type PreviewSegment } from '@/utils/promptAssembler'
import { useAuthStore } from '@/stores/auth'
import {
  Search, RefreshCw, Image as ImageIcon, LoaderCircle, Star, ThumbsUp,
  Bookmark, Copy, Plus, Library,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { UiEmptyState } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const route = useRoute()
const authStore = useAuthStore()

// Select 不接受空串/undefined 值，用哨兵值映射「全部模块」
const ALL_MODULES = '__all_modules__'
const { error, info, success, warning } = useUiFeedback()
const { retryOnError } = useImageRetry()

const isAdmin = computed(() => authStore.user?.role === 'admin')

// ── 卡片库状态 ──
const scope = ref<'gallery' | 'mine' | 'favorites'>('gallery')
const loading = ref(false)
const cards = ref<PromptCardItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(24)
const noMore = ref(false)
const loadingMore = ref(false)

const sort = ref<'latest' | 'hot' | 'most_reused'>('latest')
const moduleId = ref<number | undefined>(undefined)
const keyword = ref('')

const modules = ref<PromptModule[]>([])

const scopeOptions = [
  { value: 'gallery', label: '全部' },
  { value: 'mine', label: '我发布的' },
  { value: 'favorites', label: '我收藏的' },
]
const sortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '最热' },
  { value: 'most_reused', label: '最多复用' },
]

// 懒加载哨兵
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function loadModules() {
  try {
    const res = await promptCardsApi.modules()
    modules.value = res.data.data || []
  } catch { /* ignore */ }
}

async function loadCards() {
  loading.value = true
  page.value = 1
  noMore.value = false
  try {
    const params: PromptCardListParams = {
      page: page.value,
      pageSize: pageSize.value,
      sort: sort.value,
      scope: scope.value,
    }
    if (moduleId.value) params.moduleId = moduleId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()

    const res = await promptCardsApi.list(params)
    cards.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
    noMore.value = cards.value.length >= total.value
  } catch (e) {
    error(e, '加载提示词列表失败')
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
    const params: PromptCardListParams = {
      page: nextPage,
      pageSize: pageSize.value,
      sort: sort.value,
      scope: scope.value,
    }
    if (moduleId.value) params.moduleId = moduleId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()

    const res = await promptCardsApi.list(params)
    const records = res.data.data?.records || []
    cards.value.push(...records)
    page.value = nextPage
    total.value = res.data.data?.total || 0
    noMore.value = cards.value.length >= total.value
  } catch (e) {
    error(e, '加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

function setupObserver() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  const el = sentinelRef.value
  if (!el) return
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
  loadCards()
}

// ── 上传弹窗 ──
const showUpload = ref(false)

// ── 卡片预览弹窗 ──
const previewVisible = ref(false)
const previewCard = ref<PromptCardItem | null>(null)
function openPreview(card: PromptCardItem) {
  previewCard.value = card
  previewVisible.value = true
}

// ── 卡片互动 ──
async function toggleLike(card: PromptCardItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await promptCardsApi.like(card.id)
    card.is_liked = res.data.data.is_liked
    card.like_count = res.data.data.like_count
  } catch (e) {
    error(e, '操作失败')
  }
}

async function toggleFavorite(card: PromptCardItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await promptCardsApi.favorite(card.id)
    card.is_favorited = res.data.data.is_favorited
    card.favorite_count = res.data.data.favorite_count
    success(card.is_favorited ? '已收藏' : '已取消收藏')
  } catch (e) {
    error(e, '操作失败')
  }
}

function copyContent(card: PromptCardItem, e: Event) {
  e.stopPropagation()
  if (!card.content) return
  navigator.clipboard.writeText(card.content)
    .then(() => success('已复制提示词'))
    .catch(() => warning('复制失败，请手动复制'))
}

// 复用到拼接预览（卡片上的按钮：计数 +1 并追加文本）
async function reuseCard(card: PromptCardItem, e?: Event) {
  e?.stopPropagation()
  try {
    const res = await promptCardsApi.reuse(card.id)
    const data = res.data.data
    card.reuse_count = data.reuse_count
    const seg: PreviewSegment = {
      moduleId: card.module_id,
      moduleName: data.module_name,
      moduleType: data.module_type,
      content: data.content,
    }
    previewText.value = appendSegmentToText(previewText.value, seg)
    success(`已把「${data.module_name}」复用到拼接预览`)
  } catch (e) {
    error(e, '复用失败')
  }
}

function handlePreviewReuse(card: PromptCardItem) {
  // 预览弹窗里复用：后端计数已在弹窗内 +1，这里只需追加文本
  const card2 = cards.value.find((c) => c.id === card.id)
  if (card2) card2.reuse_count += 1
  const seg: PreviewSegment = {
    moduleId: card.module_id,
    moduleName: card.module?.name || '元素',
    moduleType: card.module?.type || 'element',
    content: card.content,
  }
  previewText.value = appendSegmentToText(previewText.value, seg)
}

// ── 拼接预览面板 ──
const previewText = ref('')

// contenteditable 富文本编辑器：行首模块名加粗标红，同时保留可手动编辑。
const previewEditorRef = ref<HTMLElement | null>(null)
const placeholderText = '（点击卡片上的「复用」按钮，提示词会按规则拼接在这里，你也可以继续编辑）'

// 模块名集合，用于判断行首是否为模块名
const moduleNameSet = computed(() => new Set(modules.value.map((m) => m.name)))

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 把纯文本渲染成带标红的 HTML：行首「模块名：」若命中模块名集合，
 * 则将该模块名包裹为 <span class="module-name">（加粗标红）。
 * 其余内容原样转义输出，靠 white-space: pre-wrap 保留换行。
 */
function renderPreviewHtml(text: string): string {
  if (!text) return ''
  const lines = text.split('\n')
  return lines
    .map((line) => {
      // 匹配行首「名称：」或「名称:」（名称不含全/半角冒号）
      const m = line.match(/^([^：:]+)([：:].*)$/)
      if (m && moduleNameSet.value.has(m[1])) {
        return `<span class="module-name">${escapeHtml(m[1])}</span>${escapeHtml(m[2])}`
      }
      return escapeHtml(line)
    })
    .join('\n')
}

/** 从 DOM 读取纯文本回写 previewText（编辑态）。 */
function onPreviewInput() {
  const el = previewEditorRef.value
  if (!el) return
  const text = el.innerText
  if (text !== previewText.value) {
    previewText.value = text
  }
}

// previewText 变化（复用卡片/重置）时同步到 DOM 并标红；
// 仅当 DOM 纯文本与 previewText 不一致才写，避免编辑态光标跳动。
watch(previewText, (val) => {
  const el = previewEditorRef.value
  if (!el) return
  if (el.innerText !== val) {
    el.innerHTML = renderPreviewHtml(val)
  }
})

// 模块列表加载完成后，若已有内容则重新标红渲染
watch(moduleNameSet, () => {
  const el = previewEditorRef.value
  if (el && previewText.value) {
    el.innerHTML = renderPreviewHtml(previewText.value)
  }
})

function resetPreview() {
  previewText.value = ''
}

function copyPrompt() {
  if (!previewText.value.trim()) return
  navigator.clipboard.writeText(previewText.value)
    .then(() => success('已复制提示词'))
    .catch(() => warning('复制失败'))
}

// 保存到私有提示词库
const showSaveDialog = ref(false)
const saveName = ref('')
const saveTags = ref<string[]>([])
const saveTagInput = ref('')

function addSaveTag() {
  const t = saveTagInput.value.trim()
  if (!t) return
  if (!saveTags.value.includes(t)) saveTags.value = [...saveTags.value, t]
  saveTagInput.value = ''
}

function removeSaveTag(tag: string) {
  saveTags.value = saveTags.value.filter((t) => t !== tag)
}
const saving = ref(false)
const { allTags } = usePromptLibrary({ pageSize: 1 })

function openSaveDialog() {
  if (!previewText.value.trim()) {
    warning('提示词内容为空，无法保存')
    return
  }
  saveName.value = previewText.value.slice(0, 20).replace(/\n/g, ' ')
  showSaveDialog.value = true
}

async function handleSave() {
  if (!saveName.value.trim()) {
    warning('请输入名称')
    return
  }
  saving.value = true
  try {
    await promptLibraryApi.create({
      name: saveName.value.trim(),
      content: previewText.value,
      tags: saveTags.value,
      segments: {},
    })
    success('提示词已保存到提示词库')
    showSaveDialog.value = false
  } catch (e) {
    error(e, '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadModules()
  loadCards()
  // 预留：?edit=<id> 不再适用（旧六层编辑流程已移除）
  void route
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <PageLayout>
    <template #header>
      <div class="workshop-header">
        <h2>提示词工坊</h2>
      </div>
    </template>

    <!-- 顶部筛选区 -->
    <div class="filter-bar">
      <div class="relative w-64 max-w-full">
        <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          v-model="keyword"
          placeholder="搜索提示词内容或备注"
          class="pl-8"
          @keyup.enter="applyFilters"
        />
      </div>
      <Select :model-value="scope" @update:model-value="(v) => { scope = String(v) as typeof scope; applyFilters() }">
        <SelectTrigger class="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in scopeOptions" :key="s.value" :value="s.value">{{ s.label }}</SelectItem>
        </SelectContent>
      </Select>
      <Select :model-value="moduleId === undefined ? ALL_MODULES : String(moduleId)" @update:model-value="(v) => { moduleId = String(v) === ALL_MODULES ? undefined : Number(v); applyFilters() }">
        <SelectTrigger class="w-36">
          <SelectValue placeholder="全部模块" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_MODULES">全部模块</SelectItem>
          <SelectItem v-for="m in modules" :key="m.id" :value="String(m.id)">{{ m.name }}</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" title="刷新" @click="loadCards"><RefreshCw /></Button>
      <div class="header-actions">
        <Button v-if="isAdmin" variant="ghost" @click="$router.push('/admin/prompt-modules')">模块管理</Button>
        <Button @click="showUpload = true"><Plus />上传提示词</Button>
      </div>
    </div>

    <!-- 排序栏 -->
    <div class="sort-bar">
      <span class="sort-label">排序：</span>
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

    <!-- 主体：瀑布流 + 拼接预览 -->
    <div class="workshop-body">
      <!-- 左：卡片瀑布流 -->
      <div class="cards-wrap">
        <div v-if="!loading && cards.length === 0" class="cards-empty">
          <UiEmptyState :title="scope === 'gallery' ? '暂无提示词，上传你的第一条吧' : '暂无内容'" />
        </div>
        <div v-else class="cards-masonry">
          <div
            v-for="card in cards"
            :key="card.id"
            class="prompt-card"
            @click="openPreview(card)"
          >
            <div class="card-image-wrap">
              <img
                v-if="card.cover_url"
                :src="card.cover_url"
                alt="提示词配图"
                loading="lazy"
                @error="retryOnError($event, card.cover_url)"
              />
              <div v-else class="card-image-placeholder">
                <ImageIcon class="size-8" />
              </div>
              <Badge v-if="card.is_official" variant="warning" class="official-badge">官方</Badge>
              <Badge
                v-if="card.module"
                :variant="card.module.type === 'forbidden' ? 'destructive' : card.module.type === 'requirement' ? 'warning' : 'secondary'"
                class="module-badge"
              >
                {{ card.module.name }}
              </Badge>
            </div>
            <div class="card-info">
              <div class="card-content-row">
                <p class="card-content">{{ card.content }}</p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  class="copy-btn"
                  title="复制内容"
                  @click.stop="copyContent(card, $event)"
                >
                  <Copy />
                </Button>
              </div>
              <div class="card-actions" @click.stop>
                <div class="action-cell">
                  <button
                    class="action-btn"
                    :class="{ 'is-active': card.is_liked }"
                    :title="card.is_liked ? '取消今日点赞' : '点赞（每天可赞一次）'"
                    @click="toggleLike(card, $event)"
                  >
                    <span class="action-top"><Star v-if="card.is_liked" class="size-3 fill-current" /><ThumbsUp v-else class="size-3" /><span>赞</span></span>
                  </button>
                  <span class="action-num">{{ card.like_count }}</span>
                </div>
                <div class="action-cell">
                  <button
                    class="action-btn"
                    :class="{ 'is-active': card.is_favorited }"
                    :title="card.is_favorited ? '取消收藏' : '收藏'"
                    @click="toggleFavorite(card, $event)"
                  >
                    <span class="action-top"><Bookmark class="size-3" :class="{ 'fill-current': card.is_favorited }" /><span>收藏</span></span>
                  </button>
                </div>
                <div class="action-cell">
                  <button
                    class="action-btn"
                    title="复用到拼接预览"
                    @click="reuseCard(card, $event)"
                  >
                    <span class="action-top"><Copy class="size-3" /><span>复用</span></span>
                  </button>
                  <span class="action-num">{{ card.reuse_count }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 懒加载哨兵 -->
        <div v-if="cards.length > 0" class="load-more-zone">
          <div ref="sentinelRef" class="sentinel"></div>
          <div v-if="loadingMore" class="loading-more">
            <LoaderCircle class="size-4 animate-spin" />
            <span>加载中…</span>
          </div>
          <div v-else-if="noMore" class="no-more">没有更多了</div>
        </div>
      </div>

      <!-- 右：提示词结构化面板（固定在右侧，flex 子元素） -->
      <div class="preview-panel">
        <div class="preview-title">提示词结构化</div>
        <div class="preview-hint">
          点击卡片「复用」把内容追加进来。要求固定第一行、禁止出现固定最后一行、元素按添加顺序排列，可手动编辑。
        </div>
        <div
          ref="previewEditorRef"
          class="preview-editor"
          :class="{ 'is-empty': !previewText }"
          contenteditable="true"
          spellcheck="false"
          :data-placeholder="placeholderText"
          @input="onPreviewInput"
        ></div>
        <div class="preview-actions">
          <Button variant="outline" size="sm" @click="resetPreview"><RefreshCw />重置</Button>
          <Button variant="outline" size="sm" :disabled="!previewText" @click="copyPrompt"><Copy />复制</Button>
          <Button size="sm" @click="openSaveDialog"><Library />保存到提示词库</Button>
        </div>
      </div>
    </div>

    <!-- 上传弹窗 -->
    <PromptCardUpload v-model="showUpload" :modules="modules" @success="loadCards" />

    <!-- 卡片预览弹窗 -->
    <PromptCardPreview v-model="previewVisible" :card="previewCard" @reuse="handlePreviewReuse" />

    <!-- 保存到提示词库弹窗 -->
    <Dialog :open="showSaveDialog" @update:open="(v: boolean) => (showSaveDialog = v)">
      <DialogContent class="sm:max-w-md" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>保存到提示词库</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label for="save-name">名称</Label>
            <Input id="save-name" v-model="saveName" placeholder="给这条提示词起个名字" maxlength="40" />
          </div>
          <div class="grid gap-1.5">
            <Label>标签（可选）</Label>
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge v-for="tag in saveTags" :key="tag" variant="secondary" class="gap-1">
                {{ tag }}
                <button type="button" class="hover:text-destructive cursor-pointer" @click="removeSaveTag(tag)">×</button>
              </Badge>
              <Input
                v-model="saveTagInput"
                placeholder="输入标签后回车"
                class="h-7 w-36 text-[0.8rem]"
                list="workshop-tag-options"
                @keyup.enter.prevent="addSaveTag"
              />
              <datalist id="workshop-tag-options">
                <option v-for="tag in allTags" :key="tag" :value="tag" />
              </datalist>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showSaveDialog = false">取消</Button>
          <Button :disabled="saving" @click="handleSave">
            <LoaderCircle v-if="saving" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>

<style scoped>
.workshop-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.workshop-header h2 {
  margin: 0;
  font-size: var(--momo-font-size-xl);
}

/* 筛选区 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--momo-color-border-soft);
  flex-shrink: 0;
}
.filter-search {
  max-width: 240px;
}
.filter-select {
  width: 140px;
}
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.sort-bar {
  display: flex;
  align-items: center;
  padding-bottom: 16px;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.sort-label {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
  margin-right: 8px;
}

/* 覆盖 PageLayout 的滚动容器：本页改为 flex 列布局，让主体撑满、左右各自滚动 */
:deep(.page-content) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 主体 */
.workshop-body {
  display: flex;
  gap: 20px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.cards-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
}
.cards-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}
.cards-masonry {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

.prompt-card {
  break-inside: avoid;
  margin-bottom: 14px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--momo-color-bg-soft);
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
  border: 1px solid var(--momo-color-border-soft);
}
.prompt-card:hover {
  box-shadow: var(--momo-shadow-md);
  transform: translateY(-2px);
}

.card-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;          /* 固定正方形，所有卡片图片区一致 */
  overflow: hidden;
  background: var(--momo-color-bg-muted);
}
.card-image-wrap img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;        /* 超出部分裁剪，铺满正方形 */
}
.card-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--momo-color-text-placeholder);
}
.official-badge {
  position: absolute;
  top: 8px;
  left: 8px;
}
.module-badge {
  position: absolute;
  top: 8px;
  right: 8px;
}

.card-info {
  padding: 10px 12px;
}
.card-content-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 6px;
}
.card-content {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
}
.card-remark {
  margin: 0 0 8px;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-actions {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  flex-wrap: nowrap;
}
.action-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 3px 4px;
  border: 1px solid var(--momo-color-border);
  border-radius: var(--momo-radius-sm);
  background: var(--momo-color-bg);
  color: var(--momo-color-text-secondary);
  cursor: pointer;
  max-width: 100%;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.action-btn:hover {
  border-color: var(--momo-color-brand);
  color: var(--momo-color-brand);
}
.action-btn.is-active {
  border-color: var(--momo-color-brand);
  color: var(--momo-color-brand);
  background: var(--momo-color-brand-subtle);
}
.action-top {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--momo-font-size-xs);
  max-width: 100%;
  overflow: hidden;
}
.action-top > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-num {
  font-size: 10px;
  color: var(--momo-color-text-placeholder);
  line-height: 1;
}
.copy-btn {
  flex-shrink: 0;
  padding: 2px;
  height: auto;
  margin-left: 0;
  color: var(--momo-color-text-placeholder);
}
.copy-btn:hover {
  color: var(--momo-color-brand);
}

/* 懒加载 */
.load-more-zone {
  padding: 16px 0 4px;
  min-height: 40px;
}
.sentinel {
  height: 1px;
}
.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--momo-color-text-secondary);
  font-size: var(--momo-font-size-sm);
}
.no-more {
  text-align: center;
  color: var(--momo-color-text-placeholder);
  font-size: var(--momo-font-size-xs);
  padding: 8px 0;
}

/* 提示词结构化面板（右侧，随父容器拉伸撑满；三按钮贴底） */
.preview-panel {
  flex: 0 0 360px;
  background: var(--momo-color-bg-soft);
  border-radius: var(--momo-radius-md);
  padding: 16px;
  border: 1px solid var(--momo-color-border-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.preview-title {
  font-size: var(--momo-font-size-base);
  font-weight: 600;
  color: var(--momo-color-text);
}
.preview-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-placeholder);
  line-height: 1.5;
}
.preview-editor {
  flex: 1;
  min-height: 200px;
  padding: 9px 11px;
  background: var(--momo-color-bg);
  border: 1px solid var(--momo-color-border);
  border-radius: var(--momo-radius-sm);
  font-family: var(--momo-font-family-base);
  font-size: var(--momo-font-size-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  outline: none;
  transition: border-color var(--momo-transition-fast);
}
.preview-editor:focus {
  border-color: var(--momo-color-brand);
}
.preview-editor.is-empty::before {
  content: attr(data-placeholder);
  color: var(--momo-color-text-placeholder);
  pointer-events: none;
}
.preview-editor :deep(.module-name) {
  color: var(--momo-color-danger);
  font-weight: 700;
}
.preview-actions {
  display: flex;
  gap: 8px;
}
.preview-actions :is(button) {
  flex: 1;
}
.preview-actions :is(button):last-child {
  flex: 1.4;
}

@media (max-width: 900px) {
  :deep(.page-content) {
    display: block;
    overflow: auto;
  }
  .workshop-body {
    flex-direction: column;
    flex: none;
  }
  .cards-wrap {
    overflow-y: visible;
  }
  .preview-panel {
    flex: none;
    width: 100%;
    height: auto;
  }
}
</style>
