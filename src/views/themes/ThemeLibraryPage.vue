<script setup lang="ts">
/**
 * ThemeLibraryPage - 主题库。
 *
 * IA：用户来这里是为了「挑一套主题去生成成套提示词」。所以图块上真正要回答的三件事是
 * 封面观感、这套主题有几个图/几个点位（决定工作量）、是官方的还是谁传的。
 * 季节与风格是检索维度，不是浏览时的首要信息，因此收进一个筛选弹层；范围（全部/官方/
 * 我的/收藏）与排序留在明面上，因为它们是最高频的切换。
 * 卡片操作分层：成套提示词（主）走图块悬停层，收藏（高频、有对应范围）常驻计数行，
 * 编辑/公开切换/删除（仅自己的主题、低频且危险）收进「更多」菜单。
 *
 * 数据口径不变：点击封面进入详情；自己上传的主题可编辑、可删除、可切换公开/私有。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import PointDetailsField from '@/components/PointDetailsField.vue'
import { themeLibraryApi, type ThemeItem, type ThemeListParams } from '@/services/themeLibraryApi'
import { ossApi } from '@/services/ossApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useClipboard } from '@/composables/useClipboard'
import { useImageRetry } from '@/composables/useImageRetry'
import { buildPointDetails, type ThemePointDetail } from '@/utils/themePoints'
import {
  Search, RefreshCw, Upload, Star,
  Eye, EyeOff, Trash2, Image as ImageIcon, LoaderCircle, X, Wand2, Pencil, Ellipsis, Copy,
  ChevronDown, TriangleAlert, Check,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { UiEmptyState, UiImagePreview, UiPagination } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

defineOptions({ name: 'ThemeLibraryPage' })

const router = useRouter()

const { success, warning, error, confirmDanger } = useUiFeedback()
const clipboard = useClipboard()
const { retryOnError } = useImageRetry()

// ── 列表状态 ──
const loading = ref(false)
const themes = ref<ThemeItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(24)
// 仅 UI：加载失败时给出可重试的落点（原来只有一条 toast，页面会停在空白）
const loadFailed = ref(false)

// ── 筛选 / 搜索 / 排序 ──
const keyword = ref('')
const scope = ref<'all' | 'official' | 'mine' | 'favorites'>('all')
const season = ref('')
const style = ref('')
const sort = ref<'default' | 'latest' | 'hot' | 'favorite'>('default')
// 仅 UI：季节/风格筛选弹层
const filterOpen = ref(false)

const scopeOptions = [
  { value: 'all', label: '全部' },
  { value: 'official', label: '官方' },
  { value: 'mine', label: '我的' },
  { value: 'favorites', label: '收藏' },
]
// value 是接口口径（'' 表示不下发该筛选），label 只是展示文案
const seasonOptions = [
  { value: '春', label: '春' },
  { value: '夏', label: '夏' },
  { value: '秋', label: '秋' },
  { value: '冬', label: '冬' },
  { value: 'none', label: '全季' },
]
const styleOptions = [
  '新中式国风', '文艺风', '休闲', '极简', '法式', '度假',
  '优雅', '职场', '运动', '喜婆婆', '小香风',
]
const sortOptions = [
  { value: 'default', label: '推荐' },
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '最热' },
  { value: 'favorite', label: '收藏最多' },
]

// ── 仅 UI：从已有字段派生的展示信息 ──
const activeFilterCount = computed(() => (season.value ? 1 : 0) + (style.value ? 1 : 0))
const activeSeasonLabel = computed(() =>
  season.value ? (seasonOptions.find((s) => s.value === season.value)?.label || season.value) : '',
)
/** 一套主题的量级（几张图、几个点位）——决定生成成本，比裸季节更有决策价值 */
function themeScale(t: ThemeItem): string {
  const images = t.images?.length || 0
  const points = t.point_details?.length || t.points?.length || 0
  const parts: string[] = []
  if (images) parts.push(`${images} 图`)
  if (points) parts.push(`${points} 点位`)
  return parts.join(' · ')
}

function clearFacets() {
  season.value = ''
  style.value = ''
  applyFilters()
}

// 详情弹窗大图预览
const previewVisible = ref(false)
const previewUrl = ref('')
function openImagePreview(url: string) {
  previewUrl.value = url
  previewVisible.value = true
}

/** 风格多选（至多 3 个） */
function toggleStyle(s: string) {
  const arr = form.value.styles
  if (arr.includes(s)) {
    form.value.styles = arr.filter((x) => x !== s)
  } else if (arr.length < 3) {
    form.value.styles = [...arr, s]
  } else {
    warning('最多选择 3 个风格')
  }
}

async function loadThemes() {
  loading.value = true
  try {
    const params: ThemeListParams = {
      page: page.value,
      pageSize: pageSize.value,
      scope: scope.value,
      sort: sort.value,
    }
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    if (season.value) params.season = season.value
    if (style.value) params.style = style.value

    const res = await themeLibraryApi.list(params)
    themes.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
    loadFailed.value = false
  } catch (e) {
    error(e, '加载主题列表失败')
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  loadThemes()
}

function onPageChange(p: number) {
  page.value = p
  loadThemes()
}

function seasonText(t: ThemeItem): string {
  return t.season.length ? t.season.join(' ') : '全季'
}

// ── 卡片操作 ──
async function toggleFavorite(theme: ThemeItem) {
  try {
    const res = await themeLibraryApi.favorite(theme.id)
    theme.is_favorited = res.data.data.is_favorited
    theme.favorite_count = res.data.data.favorite_count
    success(theme.is_favorited ? '已收藏' : '已取消收藏')
  } catch (e) {
    error(e, '收藏操作失败')
  }
}

async function togglePublic(theme: ThemeItem) {
  try {
    const next = !theme.is_public
    await themeLibraryApi.update(theme.id, { is_public: next })
    theme.is_public = next
    success(next ? '已公开，其他用户可在主题库看到它' : '已设为私有，仅自己可见')
  } catch (e) {
    error(e, '切换公开状态失败')
  }
}

async function removeTheme(theme: ThemeItem) {
  try {
    await confirmDanger({
      title: '删除主题',
      message: `确定删除主题「${theme.name}」？删除后不可恢复。`,
      confirmText: '删除',
    })
  } catch {
    return
  }
  try {
    await themeLibraryApi.remove(theme.id)
    success('主题已删除')
    // 当前页删空时回退一页，避免停留在空页
    if (themes.value.length === 1 && page.value > 1) page.value -= 1
    loadThemes()
  } catch (e) {
    error(e, '删除主题失败')
  }
}

// ── 详情预览 ──
const detailVisible = ref(false)
const detailTheme = ref<ThemeItem | null>(null)
/** 三方联动的选中点位下标：图片 / 点位列表 / 提示词共用，点任一处其余两处同步 */
const selectedPoint = ref(0)
/** 主图跟随选中点位（图片数少于点位数时取最后一张） */
const detailImageIndex = computed(() => {
  const n = detailTheme.value?.images.length ?? 0
  if (!n) return 0
  return Math.min(selectedPoint.value, n - 1)
})

function openDetail(theme: ThemeItem) {
  detailTheme.value = theme
  selectedPoint.value = 0
  detailVisible.value = true
}

/** 折叠态点位摘要：取四字段里第一个非空值 */
function pointSummary(d: ThemePointDetail): string {
  return d.scene || d.pose || d.camera || d.name || '—'
}

/** 单个点位提示词文本（字段标签与成套提示词页的存储三字段格式一致） */
function pointPromptText(d: ThemePointDetail, i: number, total: number): string {
  return [
    d.name ? `【本张点位 ${i + 1}/${total}】${d.name}` : '',
    d.scene ? `【本张场景锁定·必须严格遵守】${d.scene}` : '',
    d.pose ? `【人物姿势】${d.pose}` : '',
    d.camera ? `【机位构图】${d.camera}` : '',
  ].filter(Boolean).join('\n')
}

/** 复制统一走 useClipboard：HTTP 非安全上下文（生产 IP 直访）下自动降级 execCommand */
function copyToClipboard(text: string, okMsg: string) {
  if (!text.trim()) {
    warning('该点位暂无提示词内容')
    return
  }
  clipboard.copy(text, { successMsg: okMsg })
}

/** 复制单个点位提示词（点击同时会选中该点位） */
function copyPointPrompt(i: number) {
  const list = detailTheme.value?.point_details || []
  const d = list[i]
  if (!d) return
  void copyToClipboard(pointPromptText(d, i, list.length), `已复制 P${i + 1} 提示词`)
}

/** 一键复制全部点位提示词（【点位N】分段，空行分隔） */
function copyAllPointPrompts() {
  const list = detailTheme.value?.point_details || []
  if (!list.length) return
  const text = list
    .map((d, i) => `【点位${i + 1}】\n${pointPromptText(d, i, list.length)}`)
    .join('\n\n')
  void copyToClipboard(text, `已复制全部 ${list.length} 个提示词`)
}

/** 「更多」下拉指令分发（仅自己的主题） */
function onMoreCommand(cmd: string, theme: ThemeItem) {
  if (cmd === 'edit') openEdit(theme)
  else if (cmd === 'public') togglePublic(theme)
  else if (cmd === 'delete') removeTheme(theme)
}

// ── 成套提示词：带入主题跳转 /suite-prompt ──
function goSuitePrompt(theme: ThemeItem) {
  sessionStorage.setItem('sp_theme_handoff', JSON.stringify(theme))
  router.push('/suite-prompt')
}

// ── 上传 / 编辑弹窗（双模式：editingTheme 为 null 时是上传，否则编辑该主题） ──
const uploadVisible = ref(false)
const submitting = ref(false)
const MAX_IMAGES = 5
const editingTheme = ref<ThemeItem | null>(null)

const form = ref({
  name: '',
  season: [] as string[],
  styles: [] as string[],
  path: '',
  points: [] as ThemePointDetail[],
  is_public: false,
})
interface ImgItem { url: string; loading?: boolean }
const formImages = ref<ImgItem[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

function openUpload() {
  editingTheme.value = null
  uploadVisible.value = true
}

/** 编辑已有主题：预填全部字段；无点位字段的旧主题按旧生成逻辑预填点位 */
function openEdit(theme: ThemeItem) {
  detailVisible.value = false
  editingTheme.value = theme
  form.value = {
    name: theme.name,
    season: [...theme.season],
    styles: [...theme.styles],
    path: theme.path,
    points: theme.point_details?.length
      ? theme.point_details.map((d) => ({ ...d }))
      : buildPointDetails(theme.name, theme.path, theme.points),
    is_public: theme.is_public,
  }
  formImages.value = theme.images.map((url) => ({ url }))
  uploadVisible.value = true
}

function resetForm() {
  editingTheme.value = null
  form.value = {
    name: '', season: [], styles: [],
    path: '', points: [], is_public: false,
  }
  formImages.value = []
}

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFiles(files: FileList | File[]) {
  const arr = Array.from(files)
  if (formImages.value.length + arr.length > MAX_IMAGES) {
    warning(`最多上传 ${MAX_IMAGES} 张图片`)
  }
  const room = MAX_IMAGES - formImages.value.length
  const toUpload = arr.slice(0, room)
  for (const file of toUpload) {
    const placeholder: ImgItem = { url: '', loading: true }
    formImages.value.push(placeholder)
    const idx = formImages.value.length - 1
    try {
      const res = await ossApi.upload(file, 'materials')
      formImages.value[idx] = { url: res.publicUrl }
    } catch (e) {
      formImages.value.splice(idx, 1)
      error(e, '图片上传失败')
    }
  }
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) handleFiles(target.files)
  target.value = '' // 允许重复选择同一文件
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
}

function removeImage(idx: number) {
  formImages.value.splice(idx, 1)
}

async function submitForm() {
  if (!form.value.name.trim()) {
    warning('请填写主题名称')
    return
  }
  if (formImages.value.length < 1) {
    warning('至少上传 1 张主题图片')
    return
  }
  if (formImages.value.some((i) => i.loading)) {
    warning('图片正在上传，请稍候')
    return
  }

  submitting.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      season: form.value.season,
      styles: form.value.styles,
      images: formImages.value.map((i) => i.url),
      path: form.value.path.trim(),
      point_details: form.value.points,
      is_public: form.value.is_public,
    }
    if (editingTheme.value) {
      await themeLibraryApi.update(editingTheme.value.id, payload)
      success('主题已更新')
    } else {
      await themeLibraryApi.create(payload)
      success('主题已上传')
      // 跳到「我上传的」让用户立刻看到新主题
      scope.value = 'mine'
      sort.value = 'latest'
    }
    uploadVisible.value = false
    resetForm()
    page.value = 1
    loadThemes()
  } catch (e) {
    error(e, editingTheme.value ? '更新主题失败' : '上传主题失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadThemes()
})
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>主题库</h2>
      <p class="text-muted-foreground mt-1 max-w-3xl text-[13px] leading-normal">
        一套主题对应一组点位与提示词。先看点位数量和封面观感判断投入，再进详情核对提示词。
      </p>
    </template>
    <template #extra>
      <!-- 范围（官方 / 我的 / 收藏）是最高频切换，常驻页头 -->
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        :model-value="scope"
        @update:model-value="(v) => { if (v) { scope = String(v) as typeof scope; applyFilters() } }"
      >
        <ToggleGroupItem v-for="s in scopeOptions" :key="s.value" :value="s.value">{{ s.label }}</ToggleGroupItem>
      </ToggleGroup>
      <Button @click="openUpload"><Upload />上传主题</Button>
    </template>

    <!-- 工具栏：搜索 + 季节/风格筛选弹层 + 排序 + 计数，一行收口并吸顶 -->
    <div class="bg-background sticky top-0 z-20 mb-4 border-b pb-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative w-60 max-w-full">
          <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            v-model="keyword"
            placeholder="搜索主题名称 / 点位"
            aria-label="搜索主题"
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

        <Popover v-model:open="filterOpen">
          <PopoverTrigger as-child>
            <Button variant="outline" size="sm" class="gap-1.5">
              筛选
              <Badge v-if="activeFilterCount" variant="secondary" class="h-4 px-1 text-[10px] tabular-nums">
                {{ activeFilterCount }}
              </Badge>
              <ChevronDown class="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" class="w-72 p-0">
            <div class="px-3 pt-3 pb-2">
              <p class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">季节</p>
              <p class="text-muted-foreground/80 mt-0.5 text-[11px] leading-4">
                「全季」是主题自带的季节属性，「不限」表示不按季节筛选。
              </p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="cursor-pointer rounded-md border px-2 py-0.5 text-[12px] transition-colors"
                  :class="cn(!season ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-input text-muted-foreground hover:bg-muted')"
                  @click="season = ''; filterOpen = false; applyFilters()"
                >不限</button>
                <button
                  v-for="s in seasonOptions"
                  :key="`se-${s.value}`"
                  type="button"
                  class="cursor-pointer rounded-md border px-2 py-0.5 text-[12px] transition-colors"
                  :class="cn(season === s.value ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-input text-muted-foreground hover:bg-muted')"
                  @click="season = s.value; filterOpen = false; applyFilters()"
                >{{ s.label }}</button>
              </div>
            </div>

            <Separator />

            <div class="px-3 py-2">
              <p class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">风格</p>
              <div class="mt-1.5 max-h-56 overflow-y-auto">
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors"
                  :class="cn(!style ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')"
                  @click="style = ''; filterOpen = false; applyFilters()"
                >
                  <span>全部风格</span>
                  <Check v-if="!style" class="size-3.5 shrink-0" />
                </button>
                <button
                  v-for="s in styleOptions"
                  :key="`st-${s}`"
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors"
                  :class="cn(style === s ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')"
                  @click="style = s; filterOpen = false; applyFilters()"
                >
                  <span class="truncate">{{ s }}</span>
                  <Check v-if="style === s" class="size-3.5 shrink-0" />
                </button>
              </div>
            </div>

            <div v-if="activeFilterCount" class="border-t px-3 py-2">
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-[12px] transition-colors"
                @click="clearFacets"
              >
                <X class="size-3.5" />清除全部筛选
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" class="h-4" />

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
          <span class="text-muted-foreground text-[12px] tabular-nums">共 {{ total }} 个主题</span>
          <Button variant="ghost" size="icon-sm" title="刷新" aria-label="刷新" :disabled="loading" @click="loadThemes">
            <RefreshCw class="size-4" :class="cn('transition-transform', loading && 'animate-spin')" />
          </Button>
        </div>
      </div>

      <!-- 已生效筛选的可见摘要：单值 facet 直接点 X 摘掉 -->
      <div v-if="activeSeasonLabel || style" class="flex flex-wrap items-center gap-1.5 pt-2">
        <button
          v-if="activeSeasonLabel"
          type="button"
          class="bg-muted hover:bg-muted/70 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] transition-colors"
          @click="season = ''; applyFilters()"
        >
          季节：{{ activeSeasonLabel }}<X class="size-3" />
        </button>
        <button
          v-if="style"
          type="button"
          class="bg-muted hover:bg-muted/70 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] transition-colors"
          @click="style = ''; applyFilters()"
        >
          风格：{{ style }}<X class="size-3" />
        </button>
      </div>
    </div>

    <!-- 加载失败：整块列表不可用时给出可重试落点，而不是一片空白 -->
    <div
      v-if="loadFailed && !loading && themes.length === 0"
      class="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center"
    >
      <TriangleAlert class="text-destructive size-6" :stroke-width="1.5" />
      <p class="text-[13px] font-medium">主题列表加载失败</p>
      <p class="text-muted-foreground max-w-sm text-xs leading-5">
        网络或服务暂时不可用，已有主题未受影响，重试即可。
      </p>
      <Button size="sm" variant="outline" class="mt-1 gap-1.5" @click="loadThemes">
        <RefreshCw class="size-3.5" />重试
      </Button>
    </div>

    <!-- 主题卡片网格 -->
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-3">
      <template v-if="loading">
        <div v-for="i in 8" :key="`sk-${i}`" class="overflow-hidden rounded-lg border">
          <Skeleton class="aspect-3/4 w-full rounded-none" />
          <div class="flex flex-col gap-1.5 p-2.5">
            <Skeleton class="h-3.5 w-2/3" />
            <Skeleton class="h-3 w-1/3" />
          </div>
        </div>
      </template>

      <template v-else-if="themes.length === 0">
        <div class="col-span-full">
          <UiEmptyState
            :title="scope === 'favorites' ? '暂无收藏的主题' : scope === 'mine' ? '你还没有上传过主题' : '暂无主题'"
            :description="
              activeFilterCount
                ? '当前筛选条件下没有匹配的主题，换个季节或风格试试。'
                : scope === 'mine'
                  ? '上传一套主题后，其他用户可在主题库挑选用它生成成套提示词。'
                  : scope === 'favorites'
                    ? '在主题卡片左下角点星标即可收藏。'
                    : '官方还没有发布主题。'
            "
          >
            <div class="flex items-center justify-center gap-2">
              <Button v-if="activeFilterCount" size="sm" variant="outline" @click="clearFacets"><X />清除筛选</Button>
              <Button v-if="scope === 'mine'" size="sm" @click="openUpload"><Upload />上传主题</Button>
            </div>
          </UiEmptyState>
        </div>
      </template>

      <template v-else>
        <article
          v-for="t in themes"
          :key="t.id"
          class="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-[border-color] hover:border-input"
        >
          <div
            class="relative aspect-3/4 cursor-pointer overflow-hidden bg-muted"
            title="查看主题详情"
            @click="openDetail(t)"
          >
            <img
              v-if="t.cover_url"
              :src="t.cover_url"
              alt="主题图片"
              loading="lazy"
              class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
              @error="retryOnError($event, t.cover_url)"
            />
            <div v-else class="text-muted-foreground/50 flex size-full items-center justify-center">
              <ImageIcon class="size-8" />
            </div>

            <div class="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-1 p-1.5">
              <Badge
                v-if="t.is_global"
                variant="warning"
                class="h-5 border border-border/60 bg-background/90 text-[11px] font-normal"
              >官方</Badge>
              <Badge
                v-if="t.is_mine"
                :variant="t.is_public ? 'success' : 'secondary'"
                class="h-5 border border-border/60 bg-background/90 text-[11px] font-normal"
              >{{ t.is_public ? '公开' : '私有' }}</Badge>
            </div>

            <!-- 主操作走悬停层：卡片底部不再常驻一排按钮 -->
            <div class="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-foreground/75 via-foreground/25 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <Button size="sm" variant="secondary" class="h-7 gap-1 text-[12px]" @click.stop="goSuitePrompt(t)">
                <Wand2 class="size-3.5" />成套提示词
              </Button>
              <Button size="sm" variant="outline" class="h-7 gap-1 text-[12px]" @click.stop="openDetail(t)">
                <Eye class="size-3.5" />详情
              </Button>
            </div>
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
            <div class="truncate text-[13px] font-medium" :title="t.name">{{ t.name }}</div>
            <div class="text-muted-foreground truncate text-[11px] tabular-nums">
              {{ seasonText(t) }}<template v-if="themeScale(t)"> · {{ themeScale(t) }}</template>
            </div>
            <div v-if="t.styles.length" class="flex flex-wrap gap-1">
              <Badge v-for="s in t.styles.slice(0, 2)" :key="s" variant="outline" class="h-5 px-1.5 text-[11px] font-normal">{{ s }}</Badge>
              <span v-if="t.styles.length > 2" class="text-muted-foreground self-center text-[11px]">+{{ t.styles.length - 2 }}</span>
            </div>
          </div>

          <!-- 低频/危险操作收进菜单，收藏留在常驻行（与「收藏」范围对应） -->
          <div class="flex items-center gap-1 border-t px-2 py-1">
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-colors"
              :class="cn(t.is_favorited && 'text-foreground')"
              :title="t.is_favorited ? '取消收藏' : '收藏'"
              :aria-pressed="t.is_favorited"
              @click.stop="toggleFavorite(t)"
            >
              <Star class="size-3.5" :class="cn(t.is_favorited && 'fill-current')" />
              <span class="tabular-nums">{{ t.favorite_count || '收藏' }}</span>
            </button>
            <span class="text-muted-foreground ml-auto pr-1 text-[11px] tabular-nums">使用 {{ t.use_count }}</span>
            <DropdownMenu v-if="t.is_mine">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon-xs" title="更多操作" @click.stop>
                  <Ellipsis class="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-44" @click.stop>
                <DropdownMenuItem @click="onMoreCommand('edit', t)"><Pencil />编辑主题</DropdownMenuItem>
                <DropdownMenuItem @click="onMoreCommand('public', t)">
                  <EyeOff v-if="t.is_public" /><Eye v-else />
                  {{ t.is_public ? '设为私有' : '公开给其他用户' }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive" @click="onMoreCommand('delete', t)"><Trash2 />删除</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </article>
      </template>
    </div>

    <template #footer>
      <UiPagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :show-size-selector="false"
        :disabled="loading"
        @current-change="onPageChange"
      />
    </template>
  </PageLayout>

  <!-- 详情预览弹窗 -->
  <Dialog :open="detailVisible" @update:open="(v: boolean) => (detailVisible = v)">
    <DialogContent class="theme-detail-dialog sm:max-w-[80vw]">
      <DialogHeader>
        <DialogTitle>{{ detailTheme?.name || '主题详情' }}</DialogTitle>
      </DialogHeader>
    <div v-if="detailTheme" class="detail-body">
      <div class="detail-gallery">
        <img
          v-if="detailTheme.images.length"
          :src="detailTheme.images[detailImageIndex]"
          class="detail-main-img"
          @click="openImagePreview(detailTheme.images[detailImageIndex])"
        />
        <div v-else class="detail-main-img cover-placeholder">
          <ImageIcon class="size-10" />
        </div>
        <!-- 缩略图与点位联动：点缩略图即选中对应点位，主图/提示词同步 -->
        <div v-if="detailTheme.images.length > 1" class="detail-thumbs">
          <img
            v-for="(img, idx) in detailTheme.images"
            :key="idx"
            :src="img"
            :class="{ active: idx === detailImageIndex }"
            @click="selectedPoint = idx"
          />
        </div>

        <!-- 点位选择器：与图片/提示词联动，选中哪个点位其余两处同步 -->
        <div v-if="detailTheme.point_details?.length" class="point-picker">
          <div class="pp-title">点位（{{ detailTheme.point_details.length }}）</div>
          <button
            v-for="(d, i) in detailTheme.point_details"
            :key="i"
            class="pp-item"
            :class="{ active: i === selectedPoint }"
            :title="d.name || `点位 ${i + 1}`"
            @click="selectedPoint = i"
          >
            <span class="pp-idx">P{{ i + 1 }}</span>
            <span class="pp-name">{{ d.name || '未命名点位' }}</span>
          </button>
        </div>
      </div>

      <div class="detail-meta">
        <div class="meta-row">
          <span class="meta-label">来源</span>
          <span>
            <Badge v-if="detailTheme.is_global" variant="warning">官方</Badge>
            <template v-else-if="detailTheme.author">
              {{ detailTheme.author.nickname || detailTheme.author.username }}
              <Badge :variant="detailTheme.is_public ? 'success' : 'secondary'">
                {{ detailTheme.is_public ? '公开' : '私有' }}
              </Badge>
            </template>
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">季节</span>
          <span>{{ seasonText(detailTheme) }}</span>
        </div>
        <div v-if="detailTheme.styles.length" class="meta-row">
          <span class="meta-label">适合风格</span>
          <span>
            <Badge v-for="s in detailTheme.styles" :key="s" variant="outline" class="meta-tag">{{ s }}</Badge>
          </span>
        </div>
        <div v-if="detailTheme.path" class="meta-row">
          <span class="meta-label">点位</span>
          <span>{{ detailTheme.path }}</span>
        </div>
        <div v-if="detailTheme.point_details?.length" class="meta-row">
          <span class="meta-label">点位提示词</span>
          <div class="meta-points-detail">
            <div class="pd-toolbar">
              <span class="pd-tip">点击行选中点位</span>
              <Button size="sm" variant="outline" @click="copyAllPointPrompts">
                <Copy />复制全部 {{ detailTheme.point_details.length }} 个
              </Button>
            </div>
            <!-- 提示词行可点击选中点位，与图片/点位列表联动；未选中折叠为单行摘要 -->
            <div
              v-for="(d, i) in detailTheme.point_details"
              :key="i"
              class="point-detail-item"
              :class="{ active: i === selectedPoint }"
              @click="selectedPoint = i"
            >
              <span class="pd-idx">P{{ i + 1 }}</span>
              <div class="pd-body">
                <div v-if="i !== selectedPoint" class="pd-summary">{{ pointSummary(d) }}</div>
                <template v-else>
                  <div v-if="d.name" class="pd-line"><span class="pd-k">点位名</span><span class="pd-v" :title="d.name">{{ d.name }}</span></div>
                  <div v-if="d.scene" class="pd-line"><span class="pd-k">场景锁定</span><span class="pd-v" :title="d.scene">{{ d.scene }}</span></div>
                  <div v-if="d.pose" class="pd-line"><span class="pd-k">人物姿势</span><span class="pd-v" :title="d.pose">{{ d.pose }}</span></div>
                  <div v-if="d.camera" class="pd-line"><span class="pd-k">机位构图</span><span class="pd-v" :title="d.camera">{{ d.camera }}</span></div>
                </template>
              </div>
              <Button
                variant="link"
                size="sm"
                class="pd-copy"
                title="复制本条提示词"
                @click="copyPointPrompt(i)"
              ><Copy />复制</Button>
            </div>
          </div>
        </div>
        <div v-else-if="detailTheme.points.length" class="meta-row">
          <span class="meta-label">点位描述</span>
          <ol class="meta-points">
            <li v-for="(p, i) in detailTheme.points" :key="i">{{ p }}</li>
          </ol>
        </div>
        <div class="meta-row">
          <span class="meta-label">数据</span>
          <span>收藏 {{ detailTheme.favorite_count }} · 使用 {{ detailTheme.use_count }}</span>
        </div>
      </div>
    </div>

    <DialogFooter>
      <Button
        @click="detailTheme && goSuitePrompt(detailTheme)"
      >
        <Wand2 />成套提示词
      </Button>
      <Button
        v-if="detailTheme?.is_mine"
        variant="outline"
        @click="detailTheme && openEdit(detailTheme)"
      >
        <Pencil />编辑
      </Button>
      <Button
        :variant="detailTheme?.is_favorited ? 'secondary' : 'outline'"
        @click="detailTheme && toggleFavorite(detailTheme)"
      >
        <Star :class="{ 'fill-warning text-warning': detailTheme?.is_favorited }" />
        {{ detailTheme?.is_favorited ? '已收藏' : '收藏' }}
      </Button>
    </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 上传 / 编辑主题弹窗 -->
  <Dialog :open="uploadVisible" @update:open="(v: boolean) => { uploadVisible = v; if (!v) resetForm() }">
    <DialogScrollContent class="sm:max-w-2xl" @pointer-down-outside.prevent>
      <DialogHeader>
        <DialogTitle>{{ editingTheme ? '编辑主题' : '上传主题' }}</DialogTitle>
      </DialogHeader>
      <div class="flex flex-col gap-4">
        <div class="grid gap-1.5">
          <Label for="theme-name">主题名称 <span class="text-destructive">*</span></Label>
          <Input id="theme-name" v-model="form.name" placeholder="如：中式园林庭院" maxlength="50" />
        </div>

        <div class="grid gap-1.5">
          <Label>季节（不选 = 全季）</Label>
          <div class="flex gap-4">
            <label v-for="s in ['春', '夏', '秋', '冬']" :key="s" class="flex cursor-pointer items-center gap-1.5 text-sm">
              <Checkbox
                :model-value="form.season.includes(s)"
                @update:model-value="(v) => { form.season = v === true ? [...form.season, s] : form.season.filter((x) => x !== s) }"
              />
              {{ s }}
            </label>
          </div>
        </div>

        <div class="grid gap-1.5">
          <Label>适合风格（至多 3 个）</Label>
          <div class="flex flex-wrap gap-1.5">
            <Badge
              v-for="s in styleOptions"
              :key="s"
              :variant="form.styles.includes(s) ? 'default' : 'outline'"
              class="cursor-pointer select-none"
              @click="toggleStyle(s)"
            >
              {{ s }}
            </Badge>
          </div>
        </div>

        <div class="grid gap-1.5">
          <Label for="theme-path">点位路径（可选）</Label>
          <Input id="theme-path" v-model="form.path" placeholder="如：院外 → 中庭 → 池塘边 → 廊桥 → 茶室" maxlength="255" />
        </div>

        <div class="grid gap-1.5">
          <Label>点位提示词（固定 5 个点位，成套提示词按此生成）</Label>
          <PointDetailsField v-model="form.points" />
        </div>

        <div class="grid gap-1.5">
          <Label>主题图片（1~5 张，首图为封面） <span class="text-destructive">*</span></Label>
          <div class="upload-area" @drop="onDrop" @dragover.prevent>
            <div class="img-grid">
              <div v-for="(img, idx) in formImages" :key="idx" class="img-cell" :class="{ 'is-cover': idx === 0 }">
                <div v-if="img.loading" class="img-loading">
                  <LoaderCircle class="size-5 animate-spin" />
                </div>
                <img v-else :src="img.url" alt="预览图" />
                <div class="img-overlay">
                  <Button variant="ghost" size="icon-xs" title="删除" @click.stop="removeImage(idx)"><X /></Button>
                </div>
                <span v-if="idx === 0" class="cover-badge">封面</span>
              </div>
              <div v-if="formImages.length < MAX_IMAGES" class="upload-trigger" @click="triggerUpload">
                <Upload class="size-6" />
                <span>点击或拖拽上传</span>
                <span class="upload-tip">{{ formImages.length }} / {{ MAX_IMAGES }}</span>
              </div>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              style="display: none"
              @change="onFileChange"
            />
          </div>
        </div>

        <div class="public-switch-row">
          <Switch v-model="form.is_public" />
          <span>公开到主题库（关闭则仅自己可见）</span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="uploadVisible = false">取消</Button>
        <Button :disabled="submitting" @click="submitForm">
          <LoaderCircle v-if="submitting" class="animate-spin" />
          {{ editingTheme ? '保存' : '上传' }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>

  <UiImagePreview v-model="previewVisible" :url="previewUrl" />
</template>

<style scoped>
.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--momo-color-text-placeholder);
}

/* ── 详情弹窗 ── */
.detail-body {
  display: flex;
  gap: 20px;
}
.detail-gallery {
  width: 280px;
  flex-shrink: 0;
}
.detail-main-img {
  width: 280px;
  height: 350px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--momo-color-bg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.detail-thumbs {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.detail-thumbs img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--momo-radius-sm);
  border: 2px solid transparent;
  cursor: pointer;
}
.detail-thumbs img.active {
  border-color: var(--momo-color-brand);
}
.detail-meta {
  flex: 1;
  min-width: 0;
  /* 点位多时内容在列内滚动，弹窗整体不超过一屏 */
  max-height: 64vh;
  overflow-y: auto;
  padding-right: 4px;
}
.meta-row {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: var(--momo-font-size-sm);
  border-bottom: 1px dashed var(--momo-color-border-soft);
}
.meta-label {
  width: 64px;
  flex-shrink: 0;
  color: var(--momo-color-text-secondary);
}
.meta-tag {
  margin-right: 4px;
}
.meta-points {
  margin: 0;
  padding-left: 18px;
  color: var(--momo-color-text-secondary);
}
.meta-points li {
  margin-bottom: 2px;
}

/* ── 详情弹窗 · 点位选择器（左栏，选中项同步右侧提示词） ── */
.point-picker {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}
.pp-title {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-secondary);
}
.pp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid var(--momo-color-border-soft);
  border-radius: var(--momo-radius-sm);
  background: var(--momo-color-bg);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.pp-item:hover {
  border-color: var(--momo-color-brand);
}
.pp-item.active {
  border-color: var(--momo-color-brand);
  background: var(--momo-color-brand-subtle);
}
.pp-item.active .pp-idx,
.pp-item.active .pp-name {
  color: var(--momo-color-brand);
}
.pp-idx {
  flex-shrink: 0;
  font-weight: 600;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text);
}
.pp-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
}

/* ── 详情弹窗 · 点位提示词（右栏，与图片/点位三方联动的可点击列表） ── */
.meta-points-detail {
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-2);
  flex: 1;
  min-width: 0;
}
.point-detail-item {
  display: flex;
  gap: var(--momo-space-2);
  align-items: flex-start;
  cursor: pointer;
  padding: var(--momo-space-1) var(--momo-space-2);
  border: 1px solid transparent;
  border-radius: var(--momo-radius-sm);
  transition: background-color 0.15s, border-color 0.15s;
}
.point-detail-item:hover {
  background: var(--momo-color-bg-muted);
}
.point-detail-item.active {
  background: var(--momo-color-brand-subtle);
  border-color: var(--momo-color-brand-border);
}
.pd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--momo-space-2);
}
.pd-tip {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
}
.pd-copy {
  flex-shrink: 0;
  align-self: center;
  margin-left: var(--momo-space-1);
}
.pd-summary {
  font-size: 13px;
  line-height: 1.6;
  color: var(--momo-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pd-idx {
  flex-shrink: 0;
  min-width: 44px;
  font-weight: 600;
  color: var(--momo-color-text);
}
.point-detail-item.active .pd-idx {
  color: var(--momo-color-brand);
}
.pd-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.pd-line {
  display: flex;
  gap: var(--momo-space-2);
  font-size: 13px;
  line-height: 1.6;
  color: var(--momo-color-text-secondary);
}
.pd-k {
  flex-shrink: 0;
  color: var(--momo-color-text-tertiary);
}
.pd-k::after {
  content: '：';
}
.pd-v {
  flex: 1;
  min-width: 0;
  white-space: pre-line;
  /* 每字段最多显示 2 行，超出省略号；完整内容看悬停提示或走复制 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* ── 上传 / 编辑弹窗 ── */
.public-switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
}
.upload-area {
  width: 100%;
}
.img-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  width: 100%;
}
.img-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  background: var(--momo-color-bg-muted);
  border: 2px solid transparent;
}
.img-cell.is-cover {
  border-color: var(--momo-color-brand);
}
.img-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.img-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--momo-color-text-placeholder);
}
.img-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.45), transparent 60%);
  opacity: 0;
  transition: opacity 0.15s;
}
.img-cell:hover .img-overlay {
  opacity: 1;
}
.img-overlay :is(button) {
  color: #fff;
  margin: 2px;
  padding: 4px;
}
.cover-badge {
  position: absolute;
  left: 2px;
  bottom: 2px;
  font-size: var(--momo-font-size-xs);
  color: #fff;
  background: var(--momo-color-brand);
  padding: 1px 6px;
  border-radius: var(--momo-radius-sm);
}
.upload-trigger {
  aspect-ratio: 1;
  border: 1px dashed var(--momo-color-border);
  border-radius: var(--momo-radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--momo-color-text-placeholder);
  transition: border-color 0.15s, color 0.15s;
}
.upload-trigger:hover {
  border-color: var(--momo-color-brand);
  color: var(--momo-color-brand);
}
.upload-trigger span {
  font-size: var(--momo-font-size-xs);
}
.upload-tip {
  opacity: 0.7;
}
</style>

<style>
/* 详情大弹窗（约 80% × 80vh）：DialogContent 被传送出 scoped 树，尺寸规则需全局声明 */
.theme-detail-dialog {
  height: 80vh;
  display: flex;
  flex-direction: column;
}
.theme-detail-dialog .detail-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
