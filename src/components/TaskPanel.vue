<script setup lang="ts">
import { DsSearchInput, DsCascaderPicker } from '@/components/design-system'
import { useMediaQuery, useWindowSize } from '@vueuse/core'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { useInfiniteLoader } from '@/composables/useInfiniteLoader'
import { useTaskManager } from '@/composables/useTaskManager'
import TaskList from '@/components/TaskList.vue'
import TaskResultsList from '@/components/TaskResultsList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import ImageEditorDialog from '@/components/ImageEditorDialog.vue'
import type { TaskItem } from '@/components/TaskList.vue'
import { X, Columns2, PictureInPicture2, Search, GripVertical, ChevronDown, ChevronUp } from '@lucide/vue'
import { Button } from '@/components/design-system/primitives/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/design-system/primitives/toggle-group'
import { UiDateRangePicker } from '@/components/design-system'

const taskPanel = useTaskPanelStore()
const narrowScreen = useMediaQuery('(max-width: 1023px)')
const { width: viewportWidth } = useWindowSize()
const tm = useTaskManager()
const operationsExpanded = ref(false)
const moreMarker = ref<HTMLElement>()
const hasMore = computed(() => tm.page.value * tm.pageSize.value < tm.total.value)
useInfiniteLoader(moreMarker, () => taskPanel.listView === 'legacy' && !taskPanel.isCollapsed && hasMore.value && !tm.loading.value && !tm.loadingMore.value && !tm.historyError.value, () => tm.loadHistory(true))

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

// ─── Drag splitter ───
const isDragging = ref(false)
// Guards against the click that fires on the backdrop right after a drag ends
let suppressNextClick = false
let dragStartX = 0
let dragStartWidth = 0
let previousCursor = ''
let previousUserSelect = ''
const maxPanelWidth = computed(() => Math.max(360, viewportWidth.value - 320))
function resizePanel(width: number) { taskPanel.setWidth(Math.min(maxPanelWidth.value, width)) }

function onSplitterPointerDown(e: PointerEvent) {
  if (taskPanel.isCollapsed || narrowScreen.value || e.button !== 0) return
  isDragging.value = true
  dragStartX = e.clientX
  dragStartWidth = (e.currentTarget as HTMLElement).closest('.task-panel')!.getBoundingClientRect().width
  previousCursor = document.body.style.cursor
  previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  const delta = dragStartX - e.clientX
  resizePanel(dragStartWidth + delta)
}

function onPointerUp() {
  if (!isDragging.value) return
  isDragging.value = false
  document.body.style.cursor = previousCursor
  document.body.style.userSelect = previousUserSelect
  // mouseup is followed by a click; if it lands on the backdrop it would
  // collapse the panel, so suppress that single click.
  suppressNextClick = true
  setTimeout(() => { suppressNextClick = false }, 0)
}

onMounted(() => {
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
  tm.init()
})

onUnmounted(() => {
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
  onPointerUp()
})

// ─── Overlay backdrop ───
function onBackdropClick() {
  if (suppressNextClick) return
  if (taskPanel.isOverlay || narrowScreen.value) {
    taskPanel.collapse()
  }
}

const panelStyle = computed(() => ({
  width: (narrowScreen.value ? viewportWidth.value : Math.min(taskPanel.panelWidth, viewportWidth.value - 320)) + 'px',
}))

// 分类节点仅展开子项，最终筛选仍使用原有 feature_id。
const ALL_FEATURES = '__all__'
const featureGroups = computed(() => {
  const direct = new Set(['', 'free-gen', 'ai-photography', 'canvas'])
  const quick = tm.featureOptions.value.filter(item => !direct.has(item.id)).map(item => ({ value: item.id, label: item.label }))
  return [
    { value: ALL_FEATURES, label: '全部功能' },
    { value: 'free-gen', label: '自由生图' },
    { value: '__quick__', label: '快速生图', children: quick },
    { value: 'ai-photography', label: 'AI 摄影' },
    { value: 'canvas', label: 'AI 画布' },
  ]
})
function onFeatureFilterChange(v: unknown) {
  tm.filterFeature.value = String(v) === ALL_FEATURES ? '' : String(v)
  tm.applyFilters()
}

function onModeChange(v: unknown) {
  if (v) taskPanel.setMode(String(v) as 'side-by-side' | 'overlay')
}

function onListViewChange(v: unknown) {
  if (v === 'new' || v === 'legacy') taskPanel.setListView(v)
}

function clearRemarkSearch() {
  tm.filterRemark.value = ''
  tm.applyFilters()
}
</script>

<template>
  <!-- Overlay backdrop -->
  <div
    v-if="!taskPanel.isCollapsed && (taskPanel.isOverlay || narrowScreen)"
    class="task-panel-backdrop"
    @click="onBackdropClick"
  />

  <!-- Panel -->
  <div
    v-if="!taskPanel.isCollapsed"
    class="task-panel"
    :class="{
      'side-by-side': taskPanel.isSideBySide && !narrowScreen,
      'overlay': taskPanel.isOverlay || narrowScreen,
    }"
    :style="panelStyle"
  >
    <!-- 仅中间手柄可调宽，边缘不再占据整条拖拽区域。 -->
    <Button
      v-if="!narrowScreen"
      variant="resize"
      class="task-panel-resize-handle"
      :data-dragging="isDragging"
      role="separator"
      aria-label="调整任务面板宽度"
      aria-orientation="vertical"
      :aria-valuemin="360"
      :aria-valuemax="maxPanelWidth"
      :aria-valuenow="Math.min(taskPanel.panelWidth, maxPanelWidth)"
      title="左右拖动调整宽度，也可使用左右方向键"
      @pointerdown="onSplitterPointerDown"
      @keydown.left.prevent="resizePanel(Math.min(taskPanel.panelWidth, maxPanelWidth) + 24)"
      @keydown.right.prevent="resizePanel(Math.min(taskPanel.panelWidth, maxPanelWidth) - 24)"
    ><GripVertical /></Button>

    <div class="task-panel-inner">
      <div class="task-panel-view-switch">
        <Button
          size="sm"
          variant="outline"
          class="task-panel-operations-toggle"
          :aria-expanded="operationsExpanded"
          aria-controls="task-panel-filters task-panel-toolbar"
          @click="operationsExpanded = !operationsExpanded"
        >
          <ChevronUp v-if="operationsExpanded" /><ChevronDown v-else />
          {{ operationsExpanded ? '折叠操作' : '展开操作' }}
        </Button>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="任务列表版本"
          :model-value="taskPanel.listView"
          @update:model-value="onListViewChange"
        >
          <ToggleGroupItem value="new">简洁版</ToggleGroupItem>
          <ToggleGroupItem value="legacy">专业版</ToggleGroupItem>
        </ToggleGroup>
        <div class="task-panel-header-right">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="任务面板布局"
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
          <Button size="icon-sm" variant="outline" aria-label="收起任务面板" title="收起" @click="taskPanel.collapse()">
            <X />
          </Button>
        </div>
      </div>

      <!-- Filters -->
      <div v-show="operationsExpanded" id="task-panel-filters" class="task-panel-filters">
        <DsCascaderPicker
          :model-value="tm.filterFeature.value || ALL_FEATURES"
          :options="featureGroups"
          label="功能筛选"
          @update:model-value="onFeatureFilterChange"
        />
        <UiDateRangePicker
          :model-value="tm.filterDateRange.value"
          :shortcuts="tm.dateShortcuts"
          class="w-50"
          @update:model-value="(v) => (tm.filterDateRange.value = v)"
          @change="tm.applyFilters"
        />
        <div class="remark-search relative">

          <DsSearchInput :clearable="false"
            v-model="tm.filterRemark.value"
            placeholder="搜索备注"

            @keyup.enter="tm.applyFilters"
          />
          <Button variant="ghost" size="icon-xs" aria-label="清除备注搜索"
            v-if="tm.filterRemark.value"
            type="button"
            class="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            @click="clearRemarkSearch"
          >
            <X class="size-3.5" />
          </Button>
        </div>
      </div>

      <!-- Bulk / View mode controls -->
      <div v-show="operationsExpanded" id="task-panel-toolbar" class="task-panel-toolbar">
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
          <!-- 视图切换入口暂不展示，底层 list/grid 能力保留。 -->
        </template>
      </div>

      <!-- Task list -->
      <div v-if="taskPanel.listView === 'new'" class="task-panel-body task-panel-body-new">
        <TaskResultsList @reuse="tm.handleCopyParams" />
      </div>
      <div v-else class="task-panel-body">
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
        />
        <div ref="moreMarker" class="ds-infinite-status" role="status">
          <Button v-if="tm.historyError.value" variant="outline" @click="tm.loadHistory(hasMore && tm.tasks.value.length > 0)">加载失败，点击重试</Button>
          <span v-else-if="tm.loadingMore.value">正在加载更多…</span>
          <span v-else-if="!hasMore && tm.tasks.value.length">已加载全部任务</span>
        </div>
      </div>

    </div>
  </div>

  <!-- Task Detail Dialog -->
  <TaskDetailDialog ref="taskDetailDialog" :task="detailTask" @close="detailTask = null" />

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
</template>

<style scoped>
.task-panel-backdrop {
  position: fixed;
  inset: 0;
  background: var(--ds-overlay);
  /* 任务面板及遮罩低于公共弹窗层（z-50）。 */
  z-index: 39;
}

.task-panel {
  position: fixed;
  top: var(--ds-space-3);
  right: 0;
  bottom: var(--ds-space-5);
  z-index: 40;
  display: flex;
  border-radius: var(--ds-card-radius) 0 0 var(--ds-card-radius);
  /* 内容由内层裁切，外层允许手柄跨越左边缘。 */
  overflow: visible;
  background: var(--card);
  box-shadow: var(--ds-shadow);
  max-width: calc(100vw - var(--ds-sidebar-collapsed-width));
  animation: task-panel-slide-in 0.25s ease-out;
}

/* 与顶部导航及自由生图工作台的响应式内边距保持对齐。 */
@media (max-width: 800px) {
  .task-panel {
    bottom: var(--ds-space-3);
  }
}

@media (max-width: 767px) {
  .task-panel { top: var(--ds-space-2); }
}

@keyframes task-panel-slide-in {
  from { transform: translateX(100%); opacity: 0.5; }
  to { transform: translateX(0); opacity: 1; }
}

.task-panel.side-by-side {
  box-shadow: -2px 0 8px var(--ds-overlay-soft);
}

.task-panel.overlay {
  box-shadow: var(--ds-shadow);
  border-left: 1px solid var(--border);
}

/* 独立手柄悬在边缘中部，不占用整列布局。 */
.task-panel-resize-handle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}

/* 内层继承圆角并裁切内容，不裁切外侧的拖拽手柄。 */
.task-panel-inner {
  border-radius: inherit;
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
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.task-panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.task-panel-title {
  font-size: var(--ds-font-heading);
  font-weight: 600;
  color: var(--foreground);
  white-space: nowrap;
}

.task-panel-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.task-panel-view-switch {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.task-panel-operations-toggle { margin-right: auto; }

/* Filters */
.task-panel-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
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
  flex-shrink: 0;
  flex-wrap: wrap;
}

.bulk-count {
  font-size: var(--ds-font-body);
  font-weight: 500;
  color: var(--primary);
  margin-right: 4px;
}

/* Body */
.task-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.task-panel-body-new { padding: 0; overflow: hidden; }

/* Footer */
.task-panel-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
}

.page-size-label {
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 2px;
}

.page-size-inline-input {
  width: 36px;

  border-bottom: 1px solid var(--border);

  text-align: center;

  padding: 2px 0;

  -moz-appearance: textfield;
}
.page-size-inline-input::-webkit-inner-spin-button,
.page-size-inline-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.page-size-inline-input:focus {
  border-bottom-color: var(--primary);
}
</style>
