<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { useTaskManager } from '@/composables/useTaskManager'
import TaskList from '@/components/TaskList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import ImageEditorDialog from '@/components/ImageEditorDialog.vue'
import PublishWorkDialog from '@/components/works/PublishWorkDialog.vue'
import type { TaskItem } from '@/components/TaskList.vue'
import { X, List, LayoutGrid, Columns2, PictureInPicture2, Search } from '@lucide/vue'
import { formatCredits } from '@/types/adapter'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { UiDateRangePicker, UiPagination } from '@/components/ui'

const taskPanel = useTaskPanelStore()
const tm = useTaskManager()

// ─── Detail dialog ───
const taskDetailDialog = ref<InstanceType<typeof TaskDetailDialog>>()
const detailTask = ref<TaskItem | null>(null)

function showDetail(task: TaskItem) {
  detailTask.value = task
  nextTick(() => taskDetailDialog.value?.open())
}

// ─── Image editor dialog ───
const editorVisible = ref(false)
const editorImageUrl = ref('')
const editorTask = ref<TaskItem | null>(null)

function handleEdit(task: TaskItem) {
  const url = task.result_image_urls?.[0]
  if (!url) return
  editorImageUrl.value = url
  editorTask.value = task
  editorVisible.value = true
}

function handleEditDone(result: { dataUrl: string; file: File; sourceUrl?: string }) {
  tm.handleEditDone(result, editorTask.value)
}

// ─── Publish work dialog ───
const publishVisible = ref(false)
const publishTask = ref<TaskItem | null>(null)

function handlePublish(task: TaskItem) {
  publishTask.value = task
  publishVisible.value = true
}

// ─── Drag splitter ───
const isDragging = ref(false)
// Guards against the click that fires on the backdrop right after a drag ends
let suppressNextClick = false
let dragStartX = 0
let dragStartWidth = 0

function onSplitterMouseDown(e: MouseEvent) {
  if (taskPanel.isCollapsed) return
  isDragging.value = true
  dragStartX = e.clientX
  dragStartWidth = taskPanel.panelWidth
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function onPointerMove(e: MouseEvent) {
  if (!isDragging.value) return
  const delta = dragStartX - e.clientX
  taskPanel.setWidth(dragStartWidth + delta)
}

function onPointerUp() {
  if (!isDragging.value) return
  isDragging.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  // mouseup is followed by a click; if it lands on the backdrop it would
  // collapse the panel, so suppress that single click.
  suppressNextClick = true
  setTimeout(() => { suppressNextClick = false }, 0)
}

onMounted(() => {
  document.addEventListener('mousemove', onPointerMove)
  document.addEventListener('mouseup', onPointerUp)
  tm.init()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onPointerMove)
  document.removeEventListener('mouseup', onPointerUp)
})

// ─── Overlay backdrop ───
function onBackdropClick() {
  if (suppressNextClick) return
  if (taskPanel.isOverlay) {
    taskPanel.collapse()
  }
}

const panelStyle = computed(() => ({
  width: taskPanel.panelWidth + 'px',
}))

// 功能筛选 Select 不接受空串值，用哨兵值映射「全部功能」
const ALL_FEATURES = '__all__'
function onFeatureFilterChange(v: unknown) {
  tm.filterFeature.value = String(v) === ALL_FEATURES ? '' : String(v)
  tm.applyFilters()
}

function onModeChange(v: unknown) {
  if (v) taskPanel.setMode(String(v) as 'side-by-side' | 'overlay')
}

function onViewModeChange(v: unknown) {
  if (v) tm.viewMode.value = String(v) as 'list' | 'grid'
}

function clearRemarkSearch() {
  tm.filterRemark.value = ''
  tm.applyFilters()
}
</script>

<template>
  <!-- Overlay backdrop -->
  <div
    v-if="taskPanel.isOverlay"
    class="task-panel-backdrop"
    @click="onBackdropClick"
  />

  <!-- Panel -->
  <div
    v-if="!taskPanel.isCollapsed"
    class="task-panel"
    :class="{
      'side-by-side': taskPanel.isSideBySide,
      'overlay': taskPanel.isOverlay,
    }"
    :style="panelStyle"
  >
    <!-- Splitter (visible in both expanded modes) -->
    <div
      v-if="!taskPanel.isCollapsed"
      class="task-panel-splitter"
      :class="{ dragging: isDragging }"
      @mousedown="onSplitterMouseDown"
    />

    <div class="task-panel-inner">
      <!-- Header -->
      <div class="task-panel-header">
        <div class="task-panel-header-left">
          <span class="task-panel-title">任务列表</span>
          <Badge variant="secondary">积分: {{ formatCredits(tm.userPoints.value) }}</Badge>
          <Badge v-if="tm.hasActiveJobs.value" variant="warning">生成中...</Badge>
        </div>
        <div class="task-panel-header-right">
          <!-- Mode toggle -->
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            :model-value="taskPanel.isSideBySide ? 'side-by-side' : 'overlay'"
            @update:model-value="onModeChange"
          >
            <ToggleGroupItem value="side-by-side" title="并排">
              <Columns2 />并排
            </ToggleGroupItem>
            <ToggleGroupItem value="overlay" title="浮动">
              <PictureInPicture2 />浮动
            </ToggleGroupItem>
          </ToggleGroup>
          <!-- Collapse -->
          <Button size="sm" variant="outline" @click="taskPanel.collapse()" title="收起">
            <X />
          </Button>
        </div>
      </div>

      <!-- Filters -->
      <div class="task-panel-filters">
        <Select
          :model-value="tm.filterFeature.value || ALL_FEATURES"
          @update:model-value="onFeatureFilterChange"
        >
          <SelectTrigger class="w-30" size="sm">
            <SelectValue placeholder="功能筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="opt in tm.featureOptions.value"
              :key="opt.id || ALL_FEATURES"
              :value="opt.id || ALL_FEATURES"
            >
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <UiDateRangePicker
          :model-value="tm.filterDateRange.value"
          :shortcuts="tm.dateShortcuts"
          class="w-50"
          @update:model-value="(v) => (tm.filterDateRange.value = v)"
          @change="tm.applyFilters"
        />
        <div class="remark-search relative">
          <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            v-model="tm.filterRemark.value"
            placeholder="搜索备注"
            class="h-7 pl-7.5 text-[0.8rem]"
            @keyup.enter="tm.applyFilters"
          />
          <button
            v-if="tm.filterRemark.value"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            @click="clearRemarkSearch"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </div>

      <!-- Bulk / View mode controls -->
      <div class="task-panel-toolbar">
        <template v-if="tm.bulkMode.value">
          <span class="bulk-count">已选 {{ tm.selectedIds.value.size }} 项</span>
          <Button size="sm" variant="outline" @click="tm.selectAllTasks">
            {{ tm.selectedIds.value.size === tm.tasks.value.length && tm.tasks.value.length > 0 ? '取消全选' : '全选' }}
          </Button>
          <Button size="sm" :disabled="tm.selectedIds.value.size === 0" @click="tm.handleBatchDownload">
            批量下载
          </Button>
          <Button size="sm" :disabled="tm.selectedIds.value.size === 0" @click="tm.handleBatchPackDownload">
            打包下载
          </Button>
          <Button size="sm" variant="destructive" :disabled="tm.selectedIds.value.size === 0" @click="tm.handleBatchDelete">
            删除
          </Button>
          <Button size="sm" variant="outline" @click="tm.toggleBulkMode">
            <X />取消
          </Button>
        </template>
        <template v-else>
          <Button size="sm" variant="outline" @click="tm.toggleBulkMode">批量操作</Button>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            :model-value="tm.viewMode.value"
            @update:model-value="onViewModeChange"
          >
            <ToggleGroupItem value="list" title="列表视图"><List /></ToggleGroupItem>
            <ToggleGroupItem value="grid" title="网格视图"><LayoutGrid /></ToggleGroupItem>
          </ToggleGroup>
        </template>
      </div>

      <!-- Task list -->
      <div class="task-panel-body">
        <TaskList
          :tasks="tm.tasks.value"
          :view-mode="tm.viewMode.value"
          :loading="tm.loading.value"
          :bulk-mode="tm.bulkMode.value"
          :selected-ids="tm.selectedIds.value"
          @regenerate="tm.handleRegenerate"
          @delete="tm.handleDelete"
          @save-remark="tm.handleSaveRemark"
          @view-detail="showDetail"
          @download="tm.handleDownload"
          @copy-params="tm.handleCopyParams"
          @compare-images="tm.showCompare"
          @toggle-select="tm.handleToggleSelect"
          @retry-import="tm.retryImportTask"
          @edit="handleEdit"
          @publish="handlePublish"
        />
      </div>

      <!-- Pagination -->
      <div v-if="tm.total.value > 0 && !tm.bulkMode.value" class="task-panel-footer">
        <label class="page-size-label">
          每页
          <input
            type="number"
            class="page-size-inline-input"
            :value="tm.pageSize.value"
            min="1"
            max="200"
            @change="(e: Event) => tm.handlePageSizeChange(Math.max(1, Math.min(200, Number((e.target as HTMLInputElement).value) || 20)))"
          />
          条
        </label>
        <UiPagination
          :current-page="tm.page.value"
          :page-size="tm.pageSize.value"
          :total="tm.total.value"
          :show-size-selector="false"
          @current-change="tm.handlePageChange"
        />
      </div>
    </div>
  </div>

  <!-- Task Detail Dialog -->
  <TaskDetailDialog ref="taskDetailDialog" :task="detailTask" @close="detailTask = null" @publish="handlePublish" />

  <!-- Image Compare Dialog -->
  <ImageCompareDialog
    v-model="tm.compareVisible.value"
    :tasks="tm.tasks.value"
    :initial-index="tm.compareInitialIndex.value"
    :task-id="tm.compareTaskId.value"
  />

  <!-- Image Editor Dialog -->
  <ImageEditorDialog
    v-model="editorVisible"
    :image-url="editorImageUrl"
    :task="editorTask"
    @done="handleEditDone"
  />

  <!-- Publish Work Dialog -->
  <PublishWorkDialog
    v-model:visible="publishVisible"
    :task="publishTask"
  />
</template>

<style scoped>
.task-panel-backdrop {
  position: fixed;
  inset: 0;
  background: var(--momo-overlay-light);
  z-index: 1999;
}

.task-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  display: flex;
  background: var(--momo-color-bg);
  box-shadow: var(--momo-shadow-lg);
  max-width: calc(100vw - var(--momo-sidebar-collapsed-width));
  animation: task-panel-slide-in 0.25s ease-out;
}

@keyframes task-panel-slide-in {
  from { transform: translateX(100%); opacity: 0.5; }
  to { transform: translateX(0); opacity: 1; }
}

.task-panel.side-by-side {
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
}

.task-panel.overlay {
  box-shadow: var(--momo-shadow-lg);
  border-left: 1px solid var(--momo-color-border-soft);
}

/* Splitter */
.task-panel-splitter {
  width: 10px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--momo-color-border-soft);
  transition: background 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.task-panel-splitter::before,
.task-panel-splitter::after {
  content: '';
  width: 2px;
  height: 24px;
  border-radius: 1px;
  background: var(--momo-color-text-placeholder);
  transition: background 0.2s, height 0.2s;
}

.task-panel-splitter:hover,
.task-panel-splitter.dragging {
  background: var(--momo-color-brand-border);
  box-shadow: 0 0 8px var(--momo-color-ring);
}

.task-panel-splitter:hover::before,
.task-panel-splitter:hover::after,
.task-panel-splitter.dragging::before,
.task-panel-splitter.dragging::after {
  background: var(--momo-color-brand);
  height: 32px;
}

/* Inner container */
.task-panel-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* Header */
.task-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--momo-color-border-soft);
  flex-shrink: 0;
}

.task-panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.task-panel-title {
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  color: var(--momo-color-text);
  white-space: nowrap;
}

.task-panel-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* Filters */
.task-panel-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--momo-color-border-soft);
  flex-shrink: 0;
  flex-wrap: wrap; /* 窄面板时搜索框换行，避免被压缩裁切 */
}
.remark-search {
  flex: 1;
  min-width: 150px;
}

/* Toolbar */
.task-panel-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--momo-color-border-soft);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.bulk-count {
  font-size: var(--momo-font-size-base);
  font-weight: 500;
  color: var(--momo-color-brand);
  margin-right: 4px;
}

/* Body */
.task-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

/* Footer */
.task-panel-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid var(--momo-color-border-soft);
}

.page-size-label {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 2px;
}

.page-size-inline-input {
  width: 36px;
  border: none;
  border-bottom: 1px solid var(--momo-color-border);
  background: transparent;
  text-align: center;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text);
  padding: 2px 0;
  outline: none;
  -moz-appearance: textfield;
}
.page-size-inline-input::-webkit-inner-spin-button,
.page-size-inline-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.page-size-inline-input:focus {
  border-bottom-color: var(--momo-color-brand);
}
</style>
