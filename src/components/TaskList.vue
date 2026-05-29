<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { Refresh, Delete, View, Loading, Picture, CopyDocument, Download, ArrowDown, Check } from '@element-plus/icons-vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error } = useUiFeedback()
import type { ModelId } from '@/types/adapter'
import { MODELS } from '@/types/adapter'

export interface TaskItem {
  id: number
  toapis_task_id: string
  model: ModelId
  prompt: string
  resolution: string
  aspectRatio: string
  status: string
  progress: number
  result_image_urls: string[]
  input_image_urls: string[]
  template_image_ids: number[]
  error_message: string
  created_at: string
  completed_at: string | null
  feature_id?: string
  user_prompt?: string
}

const props = defineProps<{
  tasks: TaskItem[]
  viewMode?: 'list' | 'grid'
  loading?: boolean
  bulkMode?: boolean
  selectedIds?: Set<number>
}>()

const emit = defineEmits<{
  'regenerate': [task: TaskItem]
  'delete': [task: TaskItem]
  'viewDetail': [task: TaskItem]
  'download': [task: TaskItem]
  'copyParams': [task: TaskItem]
  'compareImages': [index: number]
  'toggleSelect': [id: number]
}>()

const statusText = computed(() => (status: string) => {
  const map: Record<string, string> = {
    submitted: '已提交', queued: '排队中', in_progress: '生成中',
    completed: '已完成', failed: '生成失败', unknown: '状态未知',
  }
  return map[status] || status
})

const statusType = computed(() => (status: string) => {
  const map: Record<string, string> = {
    submitted: 'info', queued: 'info', in_progress: 'warning',
    completed: 'success', failed: 'danger', unknown: 'info',
  }
  return map[status] || 'info'
})

// Reactive clock for live elapsed-time updates on active tasks
const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
}

function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
}

onMounted(() => { startTick() })
onDeactivated(() => { stopTick() })
onActivated(() => { startTick() })
onUnmounted(() => { stopTick() })

function modelDisplayName(modelId: string): string {
  const m = MODELS.find((m) => m.id === modelId)
  return m?.name || modelId
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => success('已复制'))
}

function promptSummary(text: string, maxLen = 60): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

function displayPrompt(task: TaskItem): string {
  if (task.feature_id && task.feature_id !== 'free-gen') {
    return task.user_prompt || ''
  }
  return task.prompt
}

// Parse DB timestamp as UTC (SQLite strings lack timezone, default to local)
function parseUTC(s: string): number {
  let t = s
  if (t && !t.endsWith('Z') && !t.includes('+') && !t.includes('T')) {
    t = t.replace(' ', 'T') + 'Z'
  }
  return new Date(t).getTime()
}

function formatDuration(seconds: number): string {
  if (seconds < 0) return ''
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
  return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`
}

function statusDuration(task: TaskItem): string {
  if (task.status === 'completed' || task.status === 'failed') {
    if (!task.completed_at) return ''
    const start = parseUTC(task.created_at)
    const end = parseUTC(task.completed_at)
    return formatDuration(Math.floor((end - start) / 1000))
  }
  // Active task: show elapsed (now is reactive, updates every second)
  const start = parseUTC(task.created_at)
  return formatDuration(Math.floor((now.value - start) / 1000))
}

function statusLabel(task: TaskItem): string {
  if (task.status === 'completed') {
    const dur = statusDuration(task)
    return dur ? `耗时 ${dur}` : ''
  }
  if (task.status === 'failed') {
    return task.error_message || '生成失败'
  }
  return statusDuration(task)
}

function isActive(status: string): boolean {
  return ['submitted', 'queued', 'in_progress'].includes(status)
}

function aspectLabel(task: TaskItem): string {
  const parts = [task.resolution, task.aspectRatio].filter(Boolean)
  return parts.join(' / ') || '-'
}

function isSelected(id: number): boolean {
  return props.selectedIds?.has(id) ?? false
}

function handleImageDragStart(e: DragEvent, url: string) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('text/plain', url)
  e.dataTransfer.effectAllowed = 'copy'
}

function toBeijingTime(isoStr: string): string {
  const d = new Date(parseUTC(isoStr) + 8 * 60 * 60 * 1000)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${mo}-${day} ${h}:${mi}`
}
</script>

<template>
  <div class="task-list" v-loading="loading">
    <el-empty v-if="!loading && tasks.length === 0" description="暂无任务" />

    <!-- List View -->
    <div v-if="viewMode !== 'grid'" class="task-cards">
      <div
          v-for="(task, idx) in tasks"
          :key="task.id"
          class="task-card"
          :class="{ 'bulk-selected': bulkMode && isSelected(task.id) }"
          @click="bulkMode && emit('toggleSelect', task.id)"
        >
        <!-- Selection circle -->
        <div v-if="bulkMode" class="task-select-circle" :class="{ checked: isSelected(task.id) }" @click.stop="emit('toggleSelect', task.id)">
          <el-icon v-if="isSelected(task.id)" size="14"><Check /></el-icon>
        </div>
        <div class="task-thumb" @click="!bulkMode && emit('compareImages', idx)">
          <img v-if="task.result_image_urls?.[0]" :src="task.result_image_urls[0]" alt=""
            draggable="true"
            @dragstart="handleImageDragStart($event, task.result_image_urls[0])" />
          <el-icon v-else-if="task.status === 'in_progress'" class="is-loading spin" size="28"><Loading /></el-icon>
          <el-icon v-else size="28"><Picture /></el-icon>
        </div>
        <div class="task-body">
          <!-- Task ID at top -->
          <div v-if="task.toapis_task_id" class="task-id">
            <span class="task-id-label">任务ID：</span>
            <span class="task-id-text">{{ task.toapis_task_id }}</span>
            <el-button :icon="CopyDocument" size="small" text type="primary" @click="copyToClipboard(task.toapis_task_id)" title="复制任务ID" />
          </div>
          <!-- Status + duration + model + params + time -->
          <div class="task-header">
            <span class="task-status-group">
              <el-tag :type="statusType(task.status)" size="small">{{ statusText(task.status) }}</el-tag>
              <span v-if="task.status === 'failed'" class="task-duration task-error-msg">{{ task.error_message || '生成失败' }}</span>
              <span v-else class="task-duration">{{ statusLabel(task) }}</span>
            </span>
            <span class="task-model">{{ modelDisplayName(task.model) }}</span>
            <span class="task-res">{{ aspectLabel(task) }}</span>
            <span class="task-time">{{ toBeijingTime(task.created_at) }}</span>
          </div>
          <!-- Prompt -->
          <div class="task-prompt">
            <span class="task-prompt-text" :title="displayPrompt(task)">{{ promptSummary(displayPrompt(task)) }}</span>
            <el-button :icon="CopyDocument" size="small" text type="primary" @click="copyToClipboard(task.prompt)" title="复制提示词" />
          </div>
          <!-- Input image thumbs -->
          <div v-if="task.input_image_urls?.length" class="task-input-thumbs">
            <img v-for="(url, i) in task.input_image_urls" :key="i" :src="url" class="input-thumb-img" />
          </div>
        </div>
        <div v-if="!bulkMode" class="task-actions">
          <el-button size="small" :icon="Refresh" type="primary" @click="emit('regenerate', task)">重新生成</el-button>
          <el-button size="small" :icon="Download" :disabled="!task.result_image_urls?.[0]" @click="emit('download', task)">下载</el-button>
          <el-dropdown trigger="click">
            <el-button size="small">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="emit('viewDetail', task)"><el-icon><View /></el-icon>详情</el-dropdown-item>
                <el-dropdown-item @click="emit('copyParams', task)"><el-icon><CopyDocument /></el-icon>重新编辑</el-dropdown-item>
                <el-dropdown-item @click="copyToClipboard(task.toapis_task_id)"><el-icon><CopyDocument /></el-icon>复制ID</el-dropdown-item>
                <el-dropdown-item @click="emit('delete', task)"><el-icon><Delete /></el-icon>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- Grid View -->
    <div v-else class="task-grid">
      <div
          v-for="(task, idx) in tasks"
          :key="task.id"
          class="task-grid-item"
          :class="{ 'bulk-selected': bulkMode && isSelected(task.id) }"
          @click="bulkMode && emit('toggleSelect', task.id)"
        >
        <!-- Selection circle -->
        <div v-if="bulkMode" class="task-select-circle" :class="{ checked: isSelected(task.id) }" @click.stop="emit('toggleSelect', task.id)">
          <el-icon v-if="isSelected(task.id)" size="14"><Check /></el-icon>
        </div>
        <div class="grid-thumb" @click="!bulkMode && emit('compareImages', idx)">
          <img v-if="task.result_image_urls?.[0]" :src="task.result_image_urls[0]" alt=""
            draggable="true"
            @dragstart="handleImageDragStart($event, task.result_image_urls[0])" />
          <el-icon v-else-if="task.status === 'in_progress'" class="is-loading spin" size="36"><Loading /></el-icon>
          <el-icon v-else size="36"><Picture /></el-icon>
          <div v-if="task.status === 'in_progress'" class="grid-progress-bar" :style="{ width: task.progress + '%' }" />
        </div>

        <!-- Info area -->
        <div class="grid-card-info">
          <!-- Input image thumbs -->
          <div v-if="task.input_image_urls?.length" class="grid-input-thumbs">
            <img v-for="(url, i) in task.input_image_urls" :key="i" :src="url" class="input-thumb-img" />
          </div>
          <div class="grid-info-row prompt-row">
            <span class="gi-value prompt-text" :title="displayPrompt(task)">{{ promptSummary(displayPrompt(task), 40) }}</span>
            <el-button size="small" text :icon="CopyDocument" @click="copyToClipboard(task.prompt)" />
          </div>
          <div class="grid-info-row">
            <span class="gi-value">
              <el-tag :type="statusType(task.status)" size="small">{{ statusText(task.status) }}</el-tag>
              <span v-if="task.status === 'failed'" class="grid-error-msg">{{ task.error_message || '生成失败' }}</span>
              <span v-else class="grid-duration">{{ statusLabel(task) }}</span>
            </span>
          </div>
          <div class="grid-info-row">
            <span class="gi-value">{{ modelDisplayName(task.model) }} · {{ aspectLabel(task) }}</span>
          </div>
          <div class="grid-info-row">
            <span class="gi-value time">{{ toBeijingTime(task.created_at) }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div v-if="!bulkMode" class="grid-card-actions">
          <el-button size="small" :icon="Refresh" type="primary" @click="emit('regenerate', task)">重新生成</el-button>
          <el-button v-if="task.result_image_urls?.[0]" size="small" :icon="Download" @click="emit('download', task)">下载</el-button>
          <el-button v-else size="small" disabled>下载</el-button>
          <el-dropdown trigger="click">
            <el-button size="small">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="emit('viewDetail', task)">详情</el-dropdown-item>
                <el-dropdown-item @click="emit('copyParams', task)">重新编辑</el-dropdown-item>
                <el-dropdown-item @click="copyToClipboard(task.toapis_task_id)">复制ID</el-dropdown-item>
                <el-dropdown-item @click="emit('delete', task)">删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.task-list { min-height: 200px; }

/* ─── Bulk selection ─── */
.task-select-circle {
  position: absolute; top: 10px; left: 10px; z-index: 3;
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.25);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  cursor: pointer;
  flex-shrink: 0;
}
.task-select-circle.checked {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}
.task-select-circle .el-icon { color: var(--momo-color-text-inverse); }
.task-card.bulk-selected { box-shadow: 0 0 0 2px var(--el-color-primary); }
.task-grid-item.bulk-selected { box-shadow: 0 0 0 2px var(--el-color-primary); }

.task-cards { display: flex; flex-direction: column; gap: 10px; }

.task-card {
  display: flex; gap: 12px; padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: var(--tf-radius-md, 8px);
  transition: box-shadow 0.2s;
  position: relative;
}
.task-card:hover { box-shadow: var(--el-box-shadow-light); }

.task-thumb {
  width: 140px; height: 140px; flex-shrink: 0;
  border-radius: var(--momo-radius-sm); overflow: hidden;
  background: var(--el-fill-color);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.task-thumb img { width: 100%; height: 100%; object-fit: cover; }

.task-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

/* Task ID at top */
.task-id {
  display: flex; align-items: center; gap: 4px;
  height: 20px; overflow: hidden; flex-shrink: 0;
}
.task-id-label {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.task-id-text {
  font-family: monospace; font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Header row */
.task-header { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; height: 22px; overflow: hidden; flex-shrink: 0; }
.task-status-group { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.task-duration { font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary); }
.task-model { font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary); }
.task-res { font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary); }
.task-time { font-size: var(--momo-font-size-sm); color: var(--el-text-color-placeholder); margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Prompt */
.task-prompt {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-regular);
  display: flex; align-items: center; gap: 4px;
  height: 20px; overflow: hidden; flex-shrink: 0;
}
.task-prompt-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-error-msg {
  font-size: var(--momo-font-size-sm); color: var(--el-color-danger); max-width: 200px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.grid-error-msg {
  font-size: var(--momo-font-size-sm); color: var(--el-color-danger); margin-left: 6px;
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Actions */
.task-actions {
  display: flex; flex-direction: column; gap: 4px;
  flex-shrink: 0; min-width: 80px;
}
.task-actions .el-button { margin-left: 0; width: 100%; }
.task-actions .el-dropdown { margin-left: 0; width: 100%; }
.task-actions .el-dropdown .el-button { width: 100%; margin-left: 0; }

/* ─── Grid View ─── */
.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.task-grid-item {
  border-radius: var(--momo-radius-md); overflow: hidden;
  background: var(--el-fill-color-lighter);
  transition: box-shadow 0.2s;
  display: flex; flex-direction: column;
  position: relative;
}
.task-grid-item:hover { box-shadow: var(--el-box-shadow-light); }

.grid-thumb {
  aspect-ratio: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--el-fill-color);
  position: relative; overflow: hidden;
}
.grid-thumb img { width: 100%; height: 100%; object-fit: cover; }
.grid-progress-bar {
  position: absolute; bottom: 0; left: 0; height: 3px;
  background: var(--el-color-primary);
  transition: width 0.3s ease;
}

.grid-card-info {
  padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  flex: 1; overflow: hidden;
}
.grid-info-row { display: flex; align-items: center; }
.grid-info-row.prompt-row { align-items: flex-start; }
.gi-value { font-size: var(--momo-font-size-sm); color: var(--el-text-color-regular); }
.gi-value.prompt-text {
  flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--el-text-color-primary);
}
.gi-value.time { color: var(--el-text-color-placeholder); }
.grid-duration { margin-left: 6px; font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary); }

.grid-card-actions {
  display: flex; gap: 4px; padding: 6px 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.grid-card-actions > .el-button { flex: 1; }
.grid-card-actions > .el-dropdown { flex: 1; }
.grid-card-actions > .el-dropdown > .el-button { width: 100%; }

/* Input image thumbnails */
.task-input-thumbs {
  display: flex; gap: 4px; margin-top: 4px;
  overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none;
}
.task-input-thumbs::-webkit-scrollbar { display: none; }

.grid-input-thumbs {
  display: flex; gap: 4px; margin-bottom: 4px;
  overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none;
}
.grid-input-thumbs::-webkit-scrollbar { display: none; }

.input-thumb-img {
  width: 56px; height: 56px; object-fit: cover; flex-shrink: 0;
  border-radius: var(--momo-radius-sm);
  border: 1px solid var(--el-border-color-lighter);
}

.spin { animation: spin-anim 1s linear infinite; }
@keyframes spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
