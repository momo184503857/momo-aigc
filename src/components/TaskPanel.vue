<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { useTaskManager } from '@/composables/useTaskManager'
import TaskList from '@/components/TaskList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import type { TaskItem } from '@/components/TaskList.vue'
import { Close, List, Grid, FullScreen } from '@element-plus/icons-vue'

const taskPanel = useTaskPanelStore()
const tm = useTaskManager()

// ─── Detail dialog ───
const taskDetailDialog = ref<InstanceType<typeof TaskDetailDialog>>()
const detailTask = ref<TaskItem | null>(null)

function showDetail(task: TaskItem) {
  detailTask.value = task
  nextTick(() => taskDetailDialog.value?.open())
}

// ─── Drag splitter ───
const isDragging = ref(false)
let dragStartX = 0
let dragStartWidth = 0

function onSplitterMouseDown(e: MouseEvent) {
  if (!taskPanel.isSideBySide) return
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
  if (taskPanel.isOverlay) {
    taskPanel.collapse()
  }
}

const panelStyle = computed(() => ({
  width: taskPanel.panelWidth + 'px',
}))
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
    <!-- Splitter (side-by-side only) -->
    <div
      v-if="taskPanel.isSideBySide"
      class="task-panel-splitter"
      :class="{ dragging: isDragging }"
      @mousedown="onSplitterMouseDown"
    />

    <div class="task-panel-inner">
      <!-- Header -->
      <div class="task-panel-header">
        <div class="task-panel-header-left">
          <span class="task-panel-title">任务列表</span>
          <el-tag type="info" size="small">积分: {{ tm.userPoints.value }}</el-tag>
          <el-tag v-if="tm.hasActiveJobs.value" type="warning" size="small">生成中...</el-tag>
        </div>
        <div class="task-panel-header-right">
          <!-- Mode toggle -->
          <el-button-group size="small">
            <el-button
              :type="taskPanel.isSideBySide ? 'primary' : 'default'"
              @click="taskPanel.setMode('side-by-side')"
            >
              <el-icon><Grid /></el-icon>并排
            </el-button>
            <el-button
              :type="taskPanel.isOverlay ? 'primary' : 'default'"
              @click="taskPanel.setMode('overlay')"
            >
              <el-icon><FullScreen /></el-icon>浮动
            </el-button>
          </el-button-group>
          <!-- Collapse -->
          <el-button size="small" :icon="Close" @click="taskPanel.collapse()" title="收起" />
        </div>
      </div>

      <!-- Filters -->
      <div class="task-panel-filters">
        <el-select
          v-model="tm.filterFeature.value"
          placeholder="功能筛选"
          size="small"
          style="width: 120px"
          clearable
          @change="tm.applyFilters"
        >
          <el-option v-for="opt in tm.featureOptions.value" :key="opt.id" :label="opt.label" :value="opt.id" />
        </el-select>
        <el-date-picker
          v-model="tm.filterDateRange.value"
          type="daterange"
          size="small"
          placeholder="日期范围"
          :shortcuts="tm.dateShortcuts"
          style="width: 200px"
          format="YYYY-MM-DD"
          @change="tm.applyFilters"
        />
      </div>

      <!-- Bulk / View mode controls -->
      <div class="task-panel-toolbar">
        <template v-if="tm.bulkMode.value">
          <span class="bulk-count">已选 {{ tm.selectedIds.value.size }} 项</span>
          <el-button size="small" @click="tm.selectAllTasks">
            {{ tm.selectedIds.value.size === tm.tasks.value.length && tm.tasks.value.length > 0 ? '取消全选' : '全选' }}
          </el-button>
          <el-button size="small" type="primary" :disabled="tm.selectedIds.value.size === 0" @click="tm.handleBatchDownload">
            批量下载
          </el-button>
          <el-button size="small" type="primary" :disabled="tm.selectedIds.value.size === 0" @click="tm.handleBatchPackDownload">
            打包下载
          </el-button>
          <el-button size="small" type="danger" :disabled="tm.selectedIds.value.size === 0" @click="tm.handleBatchDelete">
            删除
          </el-button>
          <el-button size="small" @click="tm.toggleBulkMode">
            <el-icon><Close /></el-icon>取消
          </el-button>
        </template>
        <template v-else>
          <el-button size="small" @click="tm.toggleBulkMode">批量操作</el-button>
          <el-button-group size="small">
            <el-button :type="tm.viewMode.value === 'list' ? 'primary' : 'default'" @click="tm.viewMode.value = 'list'">
              <el-icon><List /></el-icon>
            </el-button>
            <el-button :type="tm.viewMode.value === 'grid' ? 'primary' : 'default'" @click="tm.viewMode.value = 'grid'">
              <el-icon><Grid /></el-icon>
            </el-button>
          </el-button-group>
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
          @view-detail="showDetail"
          @download="tm.handleDownload"
          @copy-params="tm.handleCopyParams"
          @compare-images="tm.showCompare"
          @toggle-select="tm.handleToggleSelect"
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
        <el-pagination
          :current-page="tm.page.value"
          :page-size="tm.pageSize.value"
          :total="tm.total.value"
          layout="total, prev, pager, next"
          :pager-count="5"
          @current-change="tm.handlePageChange"
        />
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
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow);
  max-width: calc(100vw - var(--tf-sidebar-collapsed-width, 64px));
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
  box-shadow: var(--el-box-shadow-dark);
  border-left: 1px solid var(--el-border-color-lighter);
}

/* Splitter */
.task-panel-splitter {
  width: 10px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--el-border-color);
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
  background: var(--el-text-color-placeholder);
  transition: background 0.2s, height 0.2s;
}

.task-panel-splitter:hover,
.task-panel-splitter.dragging {
  background: var(--el-color-primary-light-5);
  box-shadow: 0 0 8px var(--el-color-primary-light-3);
}

.task-panel-splitter:hover::before,
.task-panel-splitter:hover::after,
.task-panel-splitter.dragging::before,
.task-panel-splitter.dragging::after {
  background: var(--momo-color-bg);
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
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.task-panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-panel-title {
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.task-panel-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Filters */
.task-panel-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

/* Toolbar */
.task-panel-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.bulk-count {
  font-size: var(--momo-font-size-base);
  font-weight: 500;
  color: var(--el-color-primary);
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
  border-top: 1px solid var(--el-border-color-lighter);
}

.page-size-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 2px;
}

.page-size-inline-input {
  width: 36px;
  border: none;
  border-bottom: 1px solid var(--el-border-color);
  background: transparent;
  text-align: center;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-primary);
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
  border-bottom-color: var(--el-color-primary);
}
</style>
