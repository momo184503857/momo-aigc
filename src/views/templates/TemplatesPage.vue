<script setup lang="ts">
import DsThumbnail from '@/components/design-system/composites/DsThumbnail.vue'
/**
 * TemplatesPage - 模板图库
 *
 * IA：图 = 主角；名称回答「这是哪张」，标签回答「去哪找它」，尺寸/体积只是选参考图
 * 时的次要校验，压到最后一行 11px。收藏序列（在工作台按顺序出现）是独立任务，
 * 所以单开一个「收藏设置」模式，而不是往每张卡上塞按钮。
 *
 * 操作分层：预览与「更多」在图块悬停层里；批量选择圈只在悬停/已选时出现；
 * 批量动作集中在吸顶工具栏的选择态。
 */
defineOptions({ name: 'TemplatesPage' })
import { ref, computed, onMounted, watch } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import {
  Upload, Pencil, Trash2, Check, X, Star, LoaderCircle,
  Eye, GripVertical, RefreshCw, TriangleAlert,
} from '@lucide/vue'
import { templateApi, type TemplateTag } from '@/services/templateApi'
import { useTemplateUpload } from '@/composables/useTemplateUpload'
import { DsScrollPage as PageLayout } from '@/components/design-system'
import GalleryTagInput from '@/components/gallery/GalleryTagInput.vue'
import { UiEmptyState, UiImagePreview, UiPagination } from '@/components/design-system'
import { Button } from '@/components/design-system/primitives/button'
import { Input } from '@/components/design-system/primitives/input'
import { Label } from '@/components/design-system/primitives/label'
import { Badge } from '@/components/design-system/primitives/badge'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { Separator } from '@/components/design-system/primitives/separator'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/design-system/primitives/dialog'
import { useImagePreview } from '@/composables/useImagePreview'

interface TemplateItem {
  id: number
  name: string
  oss_bucket: string
  oss_object_key: string
  public_url: string
  original_filename: string
  mime_type: string
  size_bytes: number
  width: number
  height: number
  created_at: string
  tags: TemplateTag[]
  is_starred: number
  sort_order: number
}

const templates = ref<TemplateItem[]>([])
const tags = ref<TemplateTag[]>([])
const loading = ref(false)
const { uploading, handleUpload } = useTemplateUpload(loadTemplates)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const selectedTagId = ref<number | 'starred' | undefined>(undefined)
const pageSizeOptions = [20, 40, 60, 100]
// 仅 UI：首屏拉取失败时的可重试落点
const loadFailed = ref(false)

// Selection
const selectedIds = ref(new Set<number>())

// Dialogs
const showEditDialog = ref(false)
const editingImage = ref<TemplateItem | null>(null)
const editingFileName = ref('')
const editingTagIds = ref<number[]>([])
const { visible: previewVisible, url: previewUrl, open: openPreview } = useImagePreview()

// ─── Starred management mode ───
const starredMode = ref(false)
const starredList = ref<TemplateItem[]>([])
const updatingStarIds = ref(new Set<number>())
const isDropZoneActive = ref(false)

// Manual mouse-based drag for reorder within starred zone
const dragState = ref<{
  index: number
  mouseX: number
  offsetX: number
  overIndex: number
} | null>(null)

const zoneItemsRef = ref<HTMLElement | null>(null)

// ─── 仅 UI：派生展示信息 ───
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / (pageSize.value || 1))))
/** 尺寸/体积/标签压成一行次要信息 */
function templateSpec(t: TemplateItem): string {
  const parts: string[] = []
  if (t.width && t.height) parts.push(`${t.width}×${t.height}`)
  const size = formatSize(t.size_bytes)
  if (size) parts.push(size)
  if (t.tags?.length) parts.push(t.tags.map((tag) => tag.name).join(' / '))
  return parts.join(' · ')
}

async function loadTemplates() {
  loading.value = true
  try {
    const res = await templateApi.list({
      page: currentPage.value,
      pageSize: pageSize.value,
      tagId: typeof selectedTagId.value === 'number' ? selectedTagId.value : undefined,
      starred: selectedTagId.value === 'starred' ? true : undefined,
    })
    const data = res.data.data
    templates.value = data.records || []
    total.value = data.total || 0
    loadFailed.value = false
  } catch {
    error('加载图库失败')
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function loadTags() {
  try {
    const res = await templateApi.listTags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}

async function loadStarredList() {
  try {
    const res = await templateApi.list({ starred: true, pageSize: 100 })
    starredList.value = res.data.data?.records || []
  } catch {
    starredList.value = []
  }
}

function toggleSelect(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function clearSelection() {
  selectedIds.value = new Set()
}


function openEdit(tmpl: TemplateItem) {
  editingImage.value = tmpl
  editingFileName.value = tmpl.name || tmpl.original_filename || ''
  editingTagIds.value = (tmpl.tags || []).map((t: TemplateTag) => t.id)
  showEditDialog.value = true
}

async function saveEdit() {
  if (!editingImage.value) return
  const newName = editingFileName.value.trim()
  if (!newName) { warning('文件名不能为空'); return }

  try {
    if (newName !== editingImage.value.name) {
      await templateApi.rename(editingImage.value.id, newName)
    }
    await templateApi.updateTags(editingImage.value.id, editingTagIds.value)
    success('保存成功')
    showEditDialog.value = false
    await loadTemplates()
    await loadTags()
  } catch (e: any) {
    error(e.message || '保存失败')
  }
}

async function handleDelete(tmpl: TemplateItem) {
  try {
    await confirmDanger({ title: '确认删除', message: `确定删除「${tmpl.name || tmpl.original_filename}」吗？此操作不可恢复。`, confirmText: '删除' })
  } catch { return }
  try {
    await templateApi.delete(tmpl.id)
    success('已删除')
    await loadTemplates()
    await loadTags()
    if (starredMode.value) await loadStarredList()
  } catch {
    error('删除失败，请重试')
  }
}

async function toggleStarred(tmpl: TemplateItem) {
  if (updatingStarIds.value.has(tmpl.id)) return
  updatingStarIds.value.add(tmpl.id)
  const isStarred = !tmpl.is_starred
  try {
    let sortOrder = 0
    if (isStarred) {
      const res = await templateApi.list({ starred: true, pageSize: 100 })
      const records: TemplateItem[] = res.data.data?.records || []
      sortOrder = Math.max(-1, ...records.map(t => t.sort_order)) + 1
    }
    await templateApi.updateStar(tmpl.id, isStarred, sortOrder)
    tmpl.is_starred = isStarred ? 1 : 0
    tmpl.sort_order = sortOrder
    success(isStarred ? '已收藏' : '已取消收藏')
    if (selectedTagId.value === 'starred') {
      selectedIds.value.delete(tmpl.id)
      await loadTemplates()
    }
  } catch {
    error(isStarred ? '收藏失败，请重试' : '取消收藏失败，请重试')
  } finally {
    updatingStarIds.value.delete(tmpl.id)
  }
}

async function batchDelete() {
  if (selectedIds.value.size === 0) return
  try {
    await confirmDanger({
      title: '批量删除',
      message: `确定要删除选中的 ${selectedIds.value.size} 张图片吗？此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    })
  } catch { return }

  let deleted = 0
  for (const id of selectedIds.value) {
    try { await templateApi.delete(id); deleted++ } catch { /* skip */ }
  }
  clearSelection()
  success(`已删除 ${deleted} 张图片`)
  await loadTemplates()
  await loadTags()
  if (starredMode.value) await loadStarredList()
}


function handlePageChange(p: number) { currentPage.value = p; loadTemplates() }
function handlePageSizeChange(s: number) { pageSize.value = s; currentPage.value = 1; loadTemplates() }

watch(selectedTagId, () => { currentPage.value = 1; clearSelection(); loadTemplates() })

onMounted(() => { loadTemplates(); loadTags() })

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ─── Starred mode toggle ───
async function toggleStarredMode() {
  if (starredMode.value) {
    starredMode.value = false
    return
  }
  starredMode.value = true
  await loadStarredList()
}

// ─── Drag from grid to drop zone ───
function handleGridDragStart(e: DragEvent, tmpl: TemplateItem) {
  if (!starredMode.value) return
  e.dataTransfer?.setData('application/template-id', String(tmpl.id))
  e.dataTransfer!.effectAllowed = 'copy'
}

function handleDropZoneDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
  isDropZoneActive.value = true
}

function handleDropZoneDragLeave(e: DragEvent) {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as HTMLElement | null
  if (!related || !target.contains(related)) isDropZoneActive.value = false
}

async function handleDropZoneDrop(e: DragEvent) {
  e.preventDefault()
  isDropZoneActive.value = false

  // Handle reorder within drop zone
  if (e.dataTransfer?.types.includes('application/starred-index')) {
    return // handled by item-level drop
  }

  const idStr = e.dataTransfer?.getData('application/template-id')
  if (!idStr) return
  const id = parseInt(idStr)

  // Already in starred list?
  if (starredList.value.some(t => t.id === id)) return

  const tmpl = templates.value.find(t => t.id === id)
  if (!tmpl) return

  // Add to starred
  const newOrder = starredList.value.length
  try {
    await templateApi.updateStar(id, true, newOrder)
    starredList.value.push({ ...tmpl, is_starred: 1, sort_order: newOrder })
    // Update in main grid too
    const idx = templates.value.findIndex(t => t.id === id)
    if (idx >= 0) {
      templates.value[idx] = { ...templates.value[idx], is_starred: 1, sort_order: newOrder }
    }
    success(`已添加「${tmpl.name || tmpl.original_filename}」到收藏`)
  } catch {
    error('添加失败')
  }
}

// ─── Reorder within drop zone (mouse-based with live reorder) ───
function handleItemMouseDown(e: MouseEvent, index: number) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('.zone-item-remove')) return

  const el = (e.currentTarget as HTMLElement).closest('.zone-item') as HTMLElement
  if (!el) return
  const rect = el.getBoundingClientRect()

  dragState.value = {
    index,
    mouseX: e.clientX,
    offsetX: e.clientX - rect.left,
    overIndex: index,
  }

  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragUp)
  e.preventDefault()
}

function handleDragMove(e: MouseEvent) {
  if (!dragState.value) return
  dragState.value.mouseX = e.clientX

  const zone = zoneItemsRef.value
  if (!zone) return
  const items = zone.querySelectorAll('.zone-item') as NodeListOf<HTMLElement>

  // Find which item the cursor is over
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect()
    if (e.clientX >= rect.left && e.clientX <= rect.right) {
      if (i !== dragState.value.index) {
        const midX = rect.left + rect.width / 2
        const targetSide = e.clientX < midX ? 'left' : 'right'
        let insertIndex = targetSide === 'left' ? i : i + 1

        // Normalize relative to current drag index
        const fromIndex = dragState.value.index
        if (fromIndex < insertIndex) insertIndex--

        if (fromIndex !== insertIndex) {
          // Reorder immediately for live animation
          const list = [...starredList.value]
          const [moved] = list.splice(fromIndex, 1)
          list.splice(insertIndex, 0, moved)
          starredList.value = list
          dragState.value.index = insertIndex
          dragState.value.overIndex = insertIndex
        }
      }
      return
    }
  }
}

async function handleDragUp() {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragUp)
  if (!dragState.value) return
  dragState.value = null
  await persistStarredOrder()
}

async function persistStarredOrder() {
  try {
    const updates = starredList.value.map((t, i) =>
      templateApi.updateStar(t.id, true, i)
    )
    await Promise.all(updates)
  } catch {
    error('排序保存失败')
  }
}

async function removeFromStarred(tmpl: TemplateItem) {
  try {
    await templateApi.updateStar(tmpl.id, false, 0)
    starredList.value = starredList.value.filter(t => t.id !== tmpl.id)
    // Re-index
    await persistStarredOrder()
    // Update main grid
    const idx = templates.value.findIndex(t => t.id === tmpl.id)
    if (idx >= 0) {
      templates.value[idx] = { ...templates.value[idx], is_starred: 0, sort_order: 0 }
    }
    success('已移除收藏')
  } catch {
    error('移除失败')
  }
}
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>模板图库</h2>
      <p class="text-muted-foreground mt-1 max-w-3xl text-sm leading-normal">
        上传、打标签并检索参考图。被收藏的图片会按你排定的顺序出现在工作台的「收藏模板」里。
      </p>
    </template>
    <template #extra>
      <Button
        :variant="starredMode ? 'secondary' : 'outline'"
        size="sm"
        class="gap-1.5"
        @click="toggleStarredMode"
      >
        <X v-if="starredMode" class="size-3.5" /><Star v-else class="size-3.5" />
        {{ starredMode ? '退出收藏设置' : '收藏设置' }}
      </Button>
      <Button size="sm" class="gap-1.5" :disabled="uploading" @click="handleUpload">
        <LoaderCircle v-if="uploading" class="size-3.5 animate-spin" />
        <Upload v-else class="size-3.5" />
        上传图片
      </Button>
    </template>

    <!-- 吸顶工具栏：标签筛选 / 列表概览 / 选择态动作 -->
    <div class="bg-background sticky top-0 z-20 mb-3 border-b pb-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="按标签筛选">
          <Badge
            as="button"
            type="button"
            :variant="selectedTagId === undefined ? 'default' : 'secondary'"
            :aria-pressed="selectedTagId === undefined"
            class="cursor-pointer select-none"
            @click="selectedTagId = undefined"
          >
            全部
          </Badge>
          <Badge
            as="button"
            type="button"
            :variant="selectedTagId === 'starred' ? 'default' : 'secondary'"
            :aria-pressed="selectedTagId === 'starred'"
            class="cursor-pointer select-none"
            @click="selectedTagId = 'starred'"
          >
            我的收藏
          </Badge>
          <Badge
            v-for="tag in tags"
            :key="tag.id"
            as="button"
            type="button"
            :variant="selectedTagId === tag.id ? 'default' : 'secondary'"
            :aria-pressed="selectedTagId === tag.id"
            class="cursor-pointer select-none"
            @click="selectedTagId = tag.id"
          >
            {{ tag.name }} ({{ tag.usage_count }})
          </Badge>
        </div>

        <Separator orientation="vertical" class="h-4" />

        <span class="text-muted-foreground text-sm tabular-nums">
          共 {{ total }} 张 · 第 {{ currentPage }} / {{ pageCount }} 页
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          title="刷新"
          aria-label="刷新图库"
          :disabled="loading"
          @click="loadTemplates"
        >
          <RefreshCw class="size-4" :class="cn('transition-transform', loading && 'animate-spin')" />
        </Button>

        <!-- 选择态：只有选了东西才出现，替代原来常驻的批量条 -->
        <template v-if="selectedIds.size > 0 && !starredMode">
          <Separator orientation="vertical" class="h-4" />
          <span class="text-sm font-medium tabular-nums">已选 {{ selectedIds.size }} 张</span>
          <div class="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" class="gap-1.5" @click="clearSelection">
              <X class="size-3.5" />取消选择
            </Button>
            <Button variant="destructive" size="sm" class="gap-1.5" @click="batchDelete">
              <Trash2 class="size-3.5" />批量删除
            </Button>
          </div>
        </template>
      </div>

      <!-- 收藏模式说明：贴着工具栏，不再单独占一条彩色横幅 -->
      <p v-if="starredMode" class="text-muted-foreground flex items-center gap-1.5 pt-2 text-sm">
        <GripVertical class="size-3.5 shrink-0" />
        把图片拖到下方「收藏序列」即可设为收藏；在序列里左右拖动调整顺序，越靠左越靠前。
      </p>
    </div>

    <!-- 加载失败 -->
    <div
      v-if="loadFailed && !loading && templates.length === 0"
      class="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center"
    >
      <TriangleAlert class="text-destructive size-6" :stroke-width="1.5" />
      <p class="text-sm font-medium">图库加载失败</p>
      <Button size="sm" variant="outline" class="mt-1 gap-1.5" @click="loadTemplates">
        <RefreshCw class="size-3.5" />重试
      </Button>
    </div>

    <!-- 图块即数据表面：1px 描边，不再套一层灰底卡 -->
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-3">
      <template v-if="loading && templates.length === 0">
        <div v-for="i in 12" :key="`sk-${i}`" class="overflow-hidden rounded-lg border">
          <Skeleton class="aspect-square w-full rounded-none" />
          <div class="flex flex-col gap-1.5 p-2.5">
            <Skeleton class="h-3.5 w-4/5" />
            <Skeleton class="h-3 w-2/5" />
          </div>
        </div>
      </template>

      <template v-else-if="templates.length === 0">
        <div class="col-span-full">
          <UiEmptyState
            :title="selectedTagId === 'starred' ? '暂无收藏图片' : '图库还是空的'"
            :description="selectedTagId === 'starred' ? '在「全部」中点击图片上的星形按钮即可收藏。' : '上传 PNG / JPG / WebP 参考图（单张 ≤10MB），打上标签后即可在工作台按标签取用。'"
          >
            <Button size="sm" class="gap-1.5" :disabled="uploading" @click="handleUpload">
              <Upload class="size-3.5" />上传图片
            </Button>
          </UiEmptyState>
        </div>
      </template>

      <template v-else>
        <article
          v-for="t in templates"
          :key="t.id"
          class="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-input"
          :class="cn(
            selectedIds.has(t.id) && !starredMode && 'border-primary ring-1 ring-primary/45',
            starredMode && t.is_starred && 'border-dashed opacity-60',
          )"
          :draggable="starredMode"
          @dragstart="handleGridDragStart($event, t)"
        >
          <div
            class="relative aspect-square overflow-hidden bg-muted"
            :class="starredMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'"
            @click="!starredMode && openPreview(t.public_url)"
          >
            <DsThumbnail
              :src="t.public_url"
              :alt="t.name || t.original_filename"
              draggable="false"
              loading="lazy"
              class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
            />

            <!-- 收藏状态：图块角标 -->
            <div v-if="t.is_starred" class="absolute top-1.5 left-1.5 z-10">
              <Badge variant="warning" class="h-5 gap-1 border border-border/60 px-1.5">
                <Star class="size-3 fill-current" />收藏
              </Badge>
            </div>

            <!-- 拖拽模式下的把手：明确「这张可以拖」 -->
            <div
              v-if="starredMode"
              class="bg-background/90 absolute top-1.5 right-1.5 z-10 flex items-center gap-1 rounded-md border border-border/60 px-1 py-0.5 text-sm"
            >
              <GripVertical class="text-muted-foreground size-3.5" />拖入下方
            </div>

            <!-- 批量选择圈：悬停或已选时才现身 -->
            <Button :variant="selectedIds.has(t.id) ? 'default' : 'secondary'"
              v-else
              size="icon-sm"
              type="button"
              :title="selectedIds.has(t.id) ? '取消选择' : '选择这张'"
              :aria-label="selectedIds.has(t.id) ? '取消选择' : '选择这张'"
              :aria-pressed="selectedIds.has(t.id)"
              class="absolute top-1.5 right-1.5 z-20 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              :class="selectedIds.has(t.id) && 'opacity-100'"
              @click.stop="toggleSelect(t.id)"
            >
              <Check class="size-3.5" />
            </Button>

            <!-- 悬停操作层：预览、编辑、收藏与删除 -->
            <div
              v-if="!starredMode"
              class="absolute left-1.5 bottom-1.5 z-20 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <Button
                variant="secondary"
                size="icon-sm"
                title="看大图"
                aria-label="看大图"

                @click.stop="openPreview(t.public_url)"
              >
                <Eye class="size-3.5" />
              </Button>
              <Button variant="secondary" size="icon-sm" title="编辑名称与标签" aria-label="编辑名称与标签" @click.stop="openEdit(t)">
                <Pencil class="size-3.5" />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                :title="t.is_starred ? '取消收藏' : '收藏图片'"
                :aria-label="t.is_starred ? '取消收藏' : '收藏图片'"
                :aria-pressed="!!t.is_starred"
                :disabled="updatingStarIds.has(t.id)"
                @click.stop="toggleStarred(t)"
              >
                <LoaderCircle v-if="updatingStarIds.has(t.id)" class="size-3.5 animate-spin" />
                <Star v-else class="size-3.5" :class="{ 'fill-current': !!t.is_starred }" />
              </Button>
              <Button variant="secondary" size="icon-sm" title="删除图片" aria-label="删除图片" @click.stop="handleDelete(t)">
                <Trash2 class="size-3.5 text-destructive" />
              </Button>
            </div>
          </div>

          <div class="min-w-0 px-2.5 py-2">
            <p
              class="truncate text-sm leading-5 font-medium"
              :title="t.name || t.original_filename"
            >
              {{ t.name || t.original_filename }}
            </p>
            <p class="text-muted-foreground mt-0.5 truncate text-sm tabular-nums" :title="templateSpec(t)">
              {{ templateSpec(t) || '未标注尺寸' }}
            </p>
          </div>
        </article>
      </template>
    </div>

    <!-- 分页（收藏模式下不需要翻页，故整条隐藏） -->
    <div
      v-if="total > 0 && !starredMode"
      class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"
    >
      <span v-if="total <= pageSize" class="text-muted-foreground text-sm tabular-nums">
        共 {{ total }} 张图片，全部在本页
      </span>
      <UiPagination
        v-else
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="pageSizeOptions"
        :total="total"
        :disabled="loading"
        class="ml-auto"
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </div>

    <!-- ─── 收藏序列（收藏模式下的投放区，紧凑成一条横向磁贴带）─── -->
    <div v-if="starredMode" class="sticky bottom-0 z-10 bg-background pt-3">
      <div class="mb-1.5 flex items-center justify-between gap-3">
        <div class="flex items-baseline gap-2">
          <span class="text-sm font-medium">收藏序列</span>
          <span class="text-muted-foreground text-sm tabular-nums">
            {{ starredList.length }} 张 · 越靠左越靠前
          </span>
        </div>
        <span v-if="dragState" class="text-muted-foreground text-sm">松手即保存顺序</span>
      </div>
      <div
        class="border-border bg-card relative rounded-lg border-2 border-dashed p-2.5 transition-colors"
        :class="{ 'border-primary bg-accent': isDropZoneActive }"
        @dragover="handleDropZoneDragOver"
        @dragleave="handleDropZoneDragLeave"
        @drop="handleDropZoneDrop"
      >
        <div v-if="starredList.length === 0" class="flex min-h-24 flex-col items-center justify-center gap-1 text-center">
          <Star class="text-muted-foreground/40 size-6" :stroke-width="1.5" />
          <p class="text-muted-foreground text-sm">把上方图片拖到这里设为收藏模板</p>
        </div>
        <div v-else ref="zoneItemsRef" class="zone-items flex min-h-24 items-start gap-2.5 overflow-x-auto pb-1">
          <div
            v-for="(t, index) in starredList"
            :key="t.id"
            class="zone-item group/zone flex w-24 shrink-0 cursor-grab flex-col gap-1 select-none"
            :class="{ 'is-dragging': dragState && dragState.index === index }"
            @mousedown="handleItemMouseDown($event, index)"
          >
            <div class="border-border group-hover/zone:border-primary relative aspect-square overflow-hidden rounded-md border-2 transition-colors">
              <DsThumbnail :src="t.public_url" :alt="t.name" class="pointer-events-none size-full object-cover" />
              <span
                class="bg-primary text-primary-foreground absolute top-1 left-1 flex size-4.5 items-center justify-center rounded text-sm font-semibold tabular-nums"
              >{{ index + 1 }}</span>
              <Button variant="destructive"
                type="button"
                class="zone-item-remove absolute top-1 right-1 flex cursor-pointer items-center justify-center opacity-0 transition-opacity group-hover/zone:opacity-100"
                aria-label="从收藏序列移除"
                @click.stop="removeFromStarred(t)"
              >
                <X class="size-3" />
              </Button>
            </div>
            <p class="text-muted-foreground truncate text-center text-sm" :title="t.name || t.original_filename">
              {{ t.name || t.original_filename }}
            </p>
          </div>
        </div>
        <!-- Floating drag preview -->
        <div
          v-if="dragState"
          class="border-primary pointer-events-none fixed z-9999 h-24 w-24 overflow-hidden rounded-md border-2 opacity-90 shadow-lg"
          :style="{
            left: (dragState.mouseX - dragState.offsetX) + 'px',
            top: zoneItemsRef?.getBoundingClientRect().top + 'px',
          }"
        >
          <DsThumbnail :src="starredList[dragState.index]?.public_url" class="size-full object-cover" />
        </div>
      </div>
    </div>

    <!-- Edit dialog -->
    <Dialog :open="showEditDialog" @update:open="(v: boolean) => (showEditDialog = v)">
      <DialogContent class="sm:max-w-4xl" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>编辑图片</DialogTitle>
        </DialogHeader>
        <div v-if="editingImage" class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label>标签</Label>
            <GalleryTagInput v-model="editingTagIds" />
          </div>
          <div class="grid gap-1.5">
            <Label for="edit-filename">文件名</Label>
            <Input id="edit-filename" v-model="editingFileName" placeholder="输入文件名" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showEditDialog = false">取消</Button>
          <Button @click="saveEdit">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
  </PageLayout>
</template>

<style scoped>
/* 拖拽落位判定依赖 .zone-item 的真实几何；此处只补一条细滚动条，其余用工具类 */
.zone-items::-webkit-scrollbar {
  height: 6px;
}
.zone-items::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
.zone-item.is-dragging {
  opacity: 0.25;
  cursor: grabbing;
  transform: scale(0.95);
}
</style>
