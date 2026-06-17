<script setup lang="ts">
defineOptions({ name: 'TemplatesPage' })
import { ref, onMounted, watch, nextTick } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import { Upload, Edit, Delete, Check, Close, StarFilled, Setting } from '@element-plus/icons-vue'
import { templateApi, type TemplateTag } from '@/services/templateApi'
import { ossApi } from '@/services/ossApi'
import PageLayout from '@/components/PageLayout.vue'
import GalleryTagInput from '@/components/gallery/GalleryTagInput.vue'
import { UiImagePreview } from '@/components/ui'
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
const uploading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const selectedTagId = ref<number | undefined>(undefined)
const pageSizeOptions = [20, 40, 60, 100]

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
const isDropZoneActive = ref(false)

// Manual mouse-based drag for reorder within starred zone
const dragState = ref<{
  index: number
  mouseX: number
  offsetX: number
  overIndex: number
} | null>(null)

const zoneItemsRef = ref<HTMLElement | null>(null)

async function loadTemplates() {
  loading.value = true
  try {
    const res = await templateApi.list({
      page: currentPage.value,
      pageSize: pageSize.value,
      tagId: selectedTagId.value,
    })
    const data = res.data.data
    templates.value = data.records || []
    total.value = data.total || 0
  } catch {
    error('加载图库失败')
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

async function handleUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp'
  input.multiple = true
  input.onchange = async () => {
    const files = Array.from(input.files || [])
    if (files.length === 0) return

    uploading.value = true
    let uploaded = 0
    for (const file of files) {
      try {
        if (file.size > 10 * 1024 * 1024) {
          warning(`${file.name} 超过 10MB，已跳过`)
          continue
        }
        const { objectKey, publicUrl, ossBucket } = await ossApi.upload(file, 'templates')
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('图片加载失败'))
          img.src = URL.createObjectURL(file)
        })
        await templateApi.create({
          name: file.name.replace(/\.[^.]+$/, ''),
          oss_bucket: ossBucket,
          oss_object_key: objectKey,
          public_url: publicUrl,
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          width: img.naturalWidth,
          height: img.naturalHeight,
        })
        uploaded++
      } catch (e: any) {
        error(`${file.name}: ${e.message || '上传失败'}`)
      }
    }
    if (uploaded > 0) success(`成功上传 ${uploaded} 张图片`)
    uploading.value = false
    await loadTemplates()
  }
  input.click()
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
    await confirmDanger({ title: '确认删除', message: '确定删除该图片吗？', confirmText: '删除' })
    await templateApi.delete(tmpl.id)
    success('已删除')
    await loadTemplates()
    await loadTags()
    if (starredMode.value) await loadStarredList()
  } catch { /* cancelled */ }
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

watch(selectedTagId, () => { currentPage.value = 1; loadTemplates() })

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
    </template>
    <template #extra>
      <el-button
        :type="starredMode ? 'warning' : 'default'"
        :icon="Setting"
        @click="toggleStarredMode"
      >
        {{ starredMode ? '退出收藏设置' : '设置收藏' }}
      </el-button>
      <el-button type="primary" :icon="Upload" :loading="uploading" @click="handleUpload">
        上传图片
      </el-button>
    </template>

    <!-- Tag filter -->
    <div v-if="tags.length > 0" class="tag-filter">
      <el-tag
        :type="!selectedTagId ? 'primary' : 'info'"
        size="small"
        class="tag-chip"
        @click="selectedTagId = undefined"
      >
        全部
      </el-tag>
      <el-tag
        v-for="tag in tags"
        :key="tag.id"
        :type="selectedTagId === tag.id ? 'primary' : 'info'"
        size="small"
        class="tag-chip"
        @click="selectedTagId = tag.id"
      >
        {{ tag.name }} ({{ tag.usage_count }})
      </el-tag>
    </div>

    <!-- Batch bar -->
    <div v-if="selectedIds.size > 0 && !starredMode" class="batch-bar">
      <span class="batch-info">已选择 {{ selectedIds.size }} 项</span>
      <el-button size="small" @click="clearSelection">取消选择</el-button>
      <el-button size="small" type="danger" @click="batchDelete">批量删除</el-button>
    </div>

    <!-- Starred mode hint -->
    <div v-if="starredMode" class="starred-hint-bar">
      <el-icon color="#E6A23C"><StarFilled /></el-icon>
      <span>将上方图片拖到下方区域设为收藏，拖动调整顺序，越靠左越靠前</span>
    </div>

    <!-- Grid -->
    <div v-loading="loading">
      <el-empty v-if="!loading && templates.length === 0" description="暂无图片，点击右上角上传" :image-size="60" />

      <div v-else class="tpl-grid">
        <div
          v-for="t in templates"
          :key="t.id"
          class="tpl-card"
          :class="{
            selected: selectedIds.has(t.id),
            'is-star-source': starredMode && t.is_starred,
          }"
          :draggable="starredMode"
          @dragstart="handleGridDragStart($event, t)"
        >
          <!-- Selection circle -->
          <div v-if="!starredMode" class="select-circle" :class="{ checked: selectedIds.has(t.id) }" @click.stop="toggleSelect(t.id)">
            <el-icon v-if="selectedIds.has(t.id)" size="14"><Check /></el-icon>
          </div>

          <!-- Star indicator -->
          <div v-if="t.is_starred" class="star-badge">
            <el-icon size="14" color="#E6A23C"><StarFilled /></el-icon>
            <span class="star-order">{{ t.sort_order }}</span>
          </div>

          <!-- Image -->
          <div class="tpl-thumb" @click="openPreview(t.public_url)">
            <img :src="t.public_url" :alt="t.name" draggable="false" />
          </div>

          <!-- Info -->
          <div class="tpl-info">
            <div class="tpl-name" :title="t.name || t.original_filename">
              {{ t.name || t.original_filename }}
            </div>
            <div v-if="t.tags && t.tags.length > 0" class="tpl-tags">
              <el-tag v-for="tag in t.tags" :key="tag.id" size="small">{{ tag.name }}</el-tag>
            </div>
            <div class="tpl-meta">
              <span v-if="t.width && t.height">{{ t.width }}x{{ t.height }}</span>
              <span>{{ formatSize(t.size_bytes) }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div v-if="!starredMode" class="tpl-actions">
            <el-button size="small" :icon="Edit" @click="openEdit(t)">编辑</el-button>
            <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(t)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > 0 && !starredMode" class="pagination-area">
      <el-pagination
        v-if="total > pageSize"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="pageSizeOptions"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
      <span v-else class="total-count">共 {{ total }} 张图片</span>
    </div>

    <!-- ─── Starred drop zone ─── -->
    <div v-if="starredMode" class="starred-zone-wrapper">
      <div
        class="starred-drop-zone"
        :class="{ 'is-active': isDropZoneActive }"
        @dragover="handleDropZoneDragOver"
        @dragleave="handleDropZoneDragLeave"
        @drop="handleDropZoneDrop"
      >
        <div v-if="starredList.length === 0" class="zone-empty">
          <el-icon size="48" color="var(--el-text-color-placeholder)"><StarFilled /></el-icon>
          <p>将上方图片拖到这里设为收藏模板</p>
        </div>
        <div v-else ref="zoneItemsRef" class="zone-items">
          <div
            v-for="(t, index) in starredList"
            :key="t.id"
            class="zone-item"
            :class="{ 'is-dragging': dragState && dragState.index === index }"
            @mousedown="handleItemMouseDown($event, index)"
          >
            <div class="zone-item-img">
              <img :src="t.public_url" :alt="t.name" />
              <span class="zone-item-order">{{ index + 1 }}</span>
              <span class="zone-item-remove" @click.stop="removeFromStarred(t)">&times;</span>
            </div>
            <div class="zone-item-name" :title="t.name || t.original_filename">
              {{ t.name || t.original_filename }}
            </div>
          </div>
        </div>
        <!-- Floating drag preview -->
        <div
          v-if="dragState"
          class="drag-preview"
          :style="{
            left: (dragState.mouseX - dragState.offsetX) + 'px',
            top: zoneItemsRef?.getBoundingClientRect().top + 'px',
          }"
        >
          <img :src="starredList[dragState.index]?.public_url" />
        </div>
      </div>
    </div>

    <!-- Edit dialog -->
    <el-dialog
      v-model="showEditDialog"
      title="编辑图片"
      width="960px"
      class="edit-dialog-lg"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form v-if="editingImage" label-position="top">
        <el-form-item label="标签">
          <GalleryTagInput v-model="editingTagIds" />
        </el-form-item>
        <el-form-item label="文件名">
          <el-input v-model="editingFileName" placeholder="输入文件名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
  </PageLayout>
</template>

<style scoped>
/* ─── Tag filter ─── */
.tag-filter {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 14px;
}
.tag-chip { cursor: pointer; user-select: none; }

/* ─── Batch bar ─── */
.batch-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; margin-bottom: 12px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: var(--el-border-radius-base);
}
.batch-info { font-size: var(--momo-font-size-base); color: var(--el-color-primary); margin-right: auto; }

/* ─── Starred mode hint ─── */
.starred-hint-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; margin-bottom: 12px;
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: var(--el-border-radius-base);
  font-size: var(--momo-font-size-sm);
  color: #b88230;
}

/* ─── Grid ─── */
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.tpl-card {
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
  transition: box-shadow 0.2s, border-color 0.2s, opacity 0.2s;
  position: relative;
  display: flex;
  flex-direction: column;
}
.tpl-card:hover { box-shadow: var(--el-box-shadow-light); }
.tpl-card.selected { border-color: var(--el-color-primary); box-shadow: 0 0 0 2px var(--el-color-primary-light-5); }
.tpl-card.is-star-source {
  opacity: 0.6;
  border-style: dashed;
}

/* Selection circle */
.select-circle {
  position: absolute; top: 10px; left: 10px; z-index: 2;
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.25);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  cursor: pointer;
}
.select-circle.checked {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}
.select-circle .el-icon { color: var(--momo-color-text-inverse); }

/* Thumb */
.tpl-thumb {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--el-fill-color);
  cursor: pointer;
}
.tpl-thumb img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.3s;
}
.tpl-card[draggable="true"] .tpl-thumb { cursor: grab; }
.tpl-thumb:hover img { transform: scale(1.05); }

/* Info */
.tpl-info {
  padding: 10px 12px;
  flex: 1;
}
.tpl-name {
  font-weight: 600; font-size: var(--momo-font-size-base); color: var(--el-text-color-primary);
  margin-bottom: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tpl-meta {
  display: flex; gap: 6px;
  font-size: var(--momo-font-size-xs); color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.tpl-tags {
  display: flex; flex-wrap: wrap; gap: 4px;
}

/* Actions */
.tpl-actions {
  display: flex; gap: 4px;
  padding: 0 12px 10px;
}

/* Star badge */
.star-badge {
  position: absolute; top: 10px; right: 10px; z-index: 2;
  display: flex; align-items: center; gap: 2px;
  background: rgba(0,0,0,0.5); border-radius: 10px;
  padding: 2px 6px 2px 4px;
}
.star-order {
  font-size: 10px; color: #fff; font-weight: 600;
}

/* Star hint in dialog */
.star-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-left: 8px;
}

/* ─── Pagination ─── */
.pagination-area {
  margin-top: 14px;
  display: flex; justify-content: space-between; align-items: center;
}
.total-count { font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary); }

/* ─── Starred drop zone ─── */
.starred-zone-wrapper {
  position: sticky;
  bottom: 0;
  margin-top: 20px;
  padding-top: 12px;
  background: linear-gradient(transparent 0px, var(--el-bg-color) 12px);
  z-index: 10;
}

.starred-drop-zone {
  min-height: 180px;
  border: 2px dashed var(--el-border-color);
  border-radius: var(--momo-radius-lg);
  background: var(--el-fill-color-blank);
  padding: 16px;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  user-select: none;
}
.starred-drop-zone.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 4px var(--el-color-primary-light-8);
}

.zone-empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  min-height: 148px;
  color: var(--el-text-color-placeholder);
}
.zone-empty p {
  margin-top: 12px;
  font-size: var(--momo-font-size-base);
}

.zone-items {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding: 4px 0;
  min-height: 148px;
  align-items: flex-start;
}
.zone-items::-webkit-scrollbar {
  height: 6px;
}
.zone-items::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}

.zone-item {
  flex-shrink: 0;
  width: 130px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: grab;
  transition: opacity 0.2s, transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.zone-item.is-dragging {
  opacity: 0.25;
  cursor: grabbing;
  transform: scale(0.95);
}

.zone-item-img {
  position: relative;
  width: 130px;
  height: 130px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  border: 2px solid var(--el-border-color-light);
  transition: border-color 0.2s;
}
.zone-item:hover .zone-item-img {
  border-color: var(--el-color-primary);
}
.zone-item-img img {
  width: 100%; height: 100%; object-fit: cover;
  pointer-events: none;
}

.zone-item-order {
  position: absolute; top: 4px; left: 4px;
  width: 22px; height: 22px; line-height: 22px;
  text-align: center;
  background: var(--el-color-primary);
  color: #fff;
  border-radius: 50%;
  font-size: 11px; font-weight: 700;
}

.zone-item-remove {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px; line-height: 20px;
  text-align: center;
  background: var(--momo-color-overlay);
  color: var(--momo-color-text-inverse);
  border-radius: 50%;
  font-size: 14px; cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}
.zone-item:hover .zone-item-remove {
  opacity: 1;
}

.zone-item-name {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-align: center;
}

/* Floating drag preview */
.drag-preview {
  position: fixed;
  width: 130px;
  height: 130px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  border: 3px solid var(--el-color-primary);
  pointer-events: none;
  z-index: 9999;
  opacity: 0.92;
  transition: box-shadow 0.2s;
}
.drag-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>

<style>
.edit-dialog-lg .el-dialog {
  height: 80vh;
  display: flex;
  flex-direction: column;
}
.edit-dialog-lg .el-dialog__body {
  flex: 1;
  overflow: auto;
}
</style>
