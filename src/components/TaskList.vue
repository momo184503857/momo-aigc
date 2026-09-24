<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { RefreshCw, Trash2, Eye, LoaderCircle, Image, Copy, Download, Check, Pencil } from '@lucide/vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { parseUTC, toBJMinute } from '@/utils/datetime'
import { Button } from '@/components/design-system/primitives/button'
import { Badge } from '@/components/design-system/primitives/badge'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { UiEmptyState } from '@/components/design-system'
const { success, info, warning, error } = useUiFeedback()
const { retryOnError } = useImageRetry()
import type { ModelId } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'

export interface TaskItem {
  /** 同一次自由生图提交的持久化批次标识 */
  client_business_id?: string | null
  id: number
  /** 系统任务号（gen-YYYYMMDDHHRRRR，展示/复制/下载命名） */
  task_no?: string
  /** 渠道侧任务号（异步渠道如 toapis 才有；同步渠道为空） */
  provider_task_id?: string | null
  logical_model_id?: number | null
  toapis_task_id?: string
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
  is_importing?: boolean
  feature_id?: string
  user_prompt?: string
  supplementaryImages?: { name: string; url: string }[]
  prompt_segments?: Record<string, string>
  negative_prompt?: string
  /** 用户任务备注（任务卡铅笔按钮编辑） */
  remark?: string
}

const modelCatalog = useModelCatalogStore()

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
  'retryImport': [task: TaskItem]
  'edit': [task: TaskItem]
  'saveRemark': [task: TaskItem, remark: string]
}>()

const editingRemarkId = ref<number | null>(null)
const remarkDraft = ref('')
const remarkInput = ref<HTMLInputElement | null>(null)

function setRemarkInput(el: unknown) {
  remarkInput.value = el instanceof HTMLInputElement ? el : null
}

async function openRemarkEditor(task: TaskItem) {
  editingRemarkId.value = task.id
  remarkDraft.value = task.remark || ''
  await nextTick()
  remarkInput.value?.focus()
  remarkInput.value?.select()
}

function saveRemark(task: TaskItem) {
  if (editingRemarkId.value !== task.id) return
  const remark = remarkDraft.value.trim()
  editingRemarkId.value = null
  if (remark === (task.remark || '')) return
  emit('saveRemark', task, remark)
}

function cancelRemarkEdit() {
  editingRemarkId.value = null
}

const statusText = computed(() => (status: string) => {
  const map: Record<string, string> = {
    submitted: '已提交', queued: '排队中', in_progress: '生成中',
    importing: '下载中', completed: '已完成', failed: '生成失败', unknown: '状态未知',
  }
  return map[status] || status
})

const statusVariant = computed(() => (status: string): 'secondary' | 'warning' | 'success' | 'destructive' => {
  const map: Record<string, 'secondary' | 'warning' | 'success' | 'destructive'> = {
    submitted: 'secondary', queued: 'secondary', in_progress: 'warning',
    importing: 'warning', completed: 'success', failed: 'destructive', unknown: 'secondary',
  }
  return map[status] || 'secondary'
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
  return modelCatalog.displayNameFor(modelId)
}

function copyToClipboard(text: string) {
  if (!text) return
  // 优先使用 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => success('已复制')).catch(() => {
      fallbackCopy(text)
    })
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    const ok = document.execCommand('copy')
    if (ok) {
      success('已复制')
    } else {
      warning('复制失败，请手动复制')
    }
  } catch {
    warning('复制失败，请手动复制')
  }
  document.body.removeChild(textarea)
}

function promptSummary(text: string, maxLen = 60): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

function displayPrompt(task: TaskItem): string {
  // 统一显示最终发送给模型的完整提示词，避免功能任务因 user_prompt 为空而显示空白
  return task.prompt || ''
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
</script>

<template>
  <div class="task-list">
    <!-- Loading skeleton -->
    <div v-if="loading" class="flex flex-col gap-2.5">
      <div v-for="i in 3" :key="i" class="flex gap-3 rounded-md p-3">
        <Skeleton class="size-35 shrink-0 rounded-sm" />
        <div class="flex flex-1 flex-col gap-2 py-1">
          <Skeleton class="h-5 w-28" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-2/3" />
        </div>
      </div>
    </div>

    <UiEmptyState v-else-if="tasks.length === 0" title="暂无任务" />

    <!-- List View -->
    <div v-if="!loading && viewMode !== 'grid'" class="task-cards">
      <div
          v-for="(task, idx) in tasks"
          :key="task.id"
          class="task-card"
          :class="{ 'bulk-selected': bulkMode && isSelected(task.id) }"
          @click="bulkMode && emit('toggleSelect', task.id)"
        >
        <!-- Selection circle -->
        <div v-if="bulkMode" class="task-select-circle" :class="{ checked: isSelected(task.id) }" @click.stop="emit('toggleSelect', task.id)">
          <Check v-if="isSelected(task.id)" class="size-3.5 text-white" />
        </div>
        <div class="task-thumb" @click="!bulkMode && emit('compareImages', idx)">
          <img v-if="task.result_image_urls?.[0]" :src="task.result_image_urls[0]" alt=""
            draggable="true"
            @error="retryOnError($event, task.result_image_urls[0])"
            @dragstart="handleImageDragStart($event, task.result_image_urls[0])" />
          <div v-else-if="task.is_importing" class="thumb-status">
            <LoaderCircle class="size-7 animate-spin" />
            <span class="thumb-status-text">正在下载图片...</span>
          </div>
          <div v-else-if="isActive(task.status)" class="thumb-status">
            <LoaderCircle class="size-7 animate-spin" />
          </div>
          <div v-else class="thumb-status">
            <Image class="size-7" />
            <Button
              v-if="task.task_no || task.toapis_task_id"
              variant="outline"
              size="icon-sm"
              class="mt-0.5 rounded-full"
              @click.stop="emit('retryImport', task)"
              title="重新加载图片"
            >
              <RefreshCw />
            </Button>
          </div>
        </div>
        <div class="task-body">
          <!-- Status + duration + time -->
          <div class="task-header">
            <span class="task-status-group">
              <Badge :variant="statusVariant(task.status)">{{ statusText(task.status) }}</Badge>
              <span v-if="task.status === 'failed'" class="task-duration task-error-msg">{{ task.error_message || '生成失败' }}</span>
              <span v-else class="task-duration">{{ statusLabel(task) }}</span>
            </span>
            <span class="task-time">{{ toBJMinute(task.created_at) }}</span>
          </div>
          <div class="task-content-row">
            <div class="task-content-main">
              <!-- Prompt -->
              <div class="task-prompt">
                <span class="task-prompt-text" :title="displayPrompt(task)">{{ promptSummary(displayPrompt(task)) }}</span>
                <Button variant="ghost" size="icon-xs" title="复制提示词" @click="copyToClipboard(task.prompt)">
                  <Copy />
                </Button>
              </div>
              <!-- Input image thumbs -->
              <div v-if="task.input_image_urls?.length" class="task-input-thumbs">
                <img v-for="(url, i) in task.input_image_urls" :key="i" :src="url" class="input-thumb-img" />
              </div>
            </div>
            <div class="task-meta">
              <span class="task-res">{{ aspectLabel(task) }}</span>
              <span class="task-model">{{ modelDisplayName(task.model) }}</span>
              <div class="task-remark-row">
                <input
                  v-if="editingRemarkId === task.id"
                  :ref="setRemarkInput"
                  v-model="remarkDraft"
                  class="task-remark-input"
                  maxlength="200"
                  aria-label="任务备注"
                  placeholder="添加备注"
                  @blur="saveRemark(task)"
                  @keydown.esc.stop.prevent="cancelRemarkEdit"
                />
                <template v-else>
                  <span v-if="task.remark" class="task-remark" :title="task.remark">{{ task.remark }}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    :title="task.remark ? '编辑备注' : '添加备注'"
                    :aria-label="task.remark ? '编辑备注' : '添加备注'"
                    @click="openRemarkEditor(task)"
                  >
                    <Pencil />
                  </Button>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div v-if="!bulkMode" class="task-actions">
          <Button size="sm" @click="emit('regenerate', task)"><RefreshCw />重新生成</Button>
          <Button size="sm" variant="outline" @click="emit('copyParams', task)"><Copy />复用参数</Button>
          <Button size="sm" variant="outline" :disabled="!task.result_image_urls?.[0]" @click="emit('download', task)"><Download />下载</Button>
          <Button size="sm" variant="outline" @click="emit('viewDetail', task)"><Eye />详情</Button>
          <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" @click="emit('delete', task)"><Trash2 />删除</Button>
        </div>
      </div>
    </div>

    <!-- Grid View -->
    <div v-else-if="!loading" class="task-grid">
      <div
          v-for="(task, idx) in tasks"
          :key="task.id"
          class="task-grid-item"
          :class="{ 'bulk-selected': bulkMode && isSelected(task.id) }"
          @click="bulkMode && emit('toggleSelect', task.id)"
        >
        <!-- Selection circle -->
        <div v-if="bulkMode" class="task-select-circle" :class="{ checked: isSelected(task.id) }" @click.stop="emit('toggleSelect', task.id)">
          <Check v-if="isSelected(task.id)" class="size-3.5 text-white" />
        </div>
        <div class="grid-thumb" @click="!bulkMode && emit('compareImages', idx)">
          <img v-if="task.result_image_urls?.[0]" :src="task.result_image_urls[0]" alt=""
            draggable="true"
            @error="retryOnError($event, task.result_image_urls[0])"
            @dragstart="handleImageDragStart($event, task.result_image_urls[0])" />
          <div v-else-if="task.is_importing" class="thumb-status grid-thumb-status">
            <LoaderCircle class="size-9 animate-spin" />
            <span class="thumb-status-text">正在下载图片...</span>
          </div>
          <div v-else-if="isActive(task.status)" class="thumb-status grid-thumb-status">
            <LoaderCircle class="size-9 animate-spin" />
          </div>
          <div v-else class="thumb-status grid-thumb-status">
            <Image class="size-9" />
            <Button
              v-if="task.task_no || task.toapis_task_id"
              variant="outline"
              size="icon-sm"
              class="mt-0.5 rounded-full"
              @click.stop="emit('retryImport', task)"
              title="重新加载图片"
            >
              <RefreshCw />
            </Button>
          </div>
          <div v-if="isActive(task.status)" class="grid-progress-bar" :style="{ width: task.progress + '%' }" />
        </div>

        <!-- Info area -->
        <div class="grid-card-info">
          <!-- Input image thumbs -->
          <div v-if="task.input_image_urls?.length" class="grid-input-thumbs">
            <img v-for="(url, i) in task.input_image_urls" :key="i" :src="url" class="input-thumb-img" />
          </div>
          <div class="grid-info-row prompt-row">
            <span class="gi-value prompt-text" :title="displayPrompt(task)">{{ promptSummary(displayPrompt(task), 40) }}</span>
            <Button variant="ghost" size="icon-xs" title="复制提示词" @click="copyToClipboard(task.prompt)">
              <Copy />
            </Button>
          </div>
          <div class="grid-info-row">
            <span class="gi-value">
              <Badge :variant="statusVariant(task.status)">{{ statusText(task.status) }}</Badge>
              <span v-if="task.status === 'failed'" class="grid-error-msg">{{ task.error_message || '生成失败' }}</span>
              <span v-else class="grid-duration">{{ statusLabel(task) }}</span>
            </span>
          </div>
          <div class="grid-info-row">
            <span class="gi-value">{{ modelDisplayName(task.model) }} · {{ aspectLabel(task) }}</span>
          </div>
          <div class="grid-info-row">
            <span class="gi-value time">{{ toBJMinute(task.created_at) }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div v-if="!bulkMode" class="grid-card-actions">
          <Button size="sm" @click="emit('regenerate', task)"><RefreshCw />重新生成</Button>
          <Button size="sm" variant="outline" @click="emit('copyParams', task)"><Copy />复用参数</Button>
          <Button size="sm" variant="outline" :disabled="!task.result_image_urls?.[0]" @click="emit('download', task)"><Download />下载</Button>
          <Button size="sm" variant="outline" @click="emit('viewDetail', task)"><Eye />详情</Button>
          <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" @click="emit('delete', task)"><Trash2 />删除</Button>
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
  border: 2px solid var(--momo-overlay-text);
  background: var(--momo-overlay-dim);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  cursor: pointer;
  flex-shrink: 0;
}
.task-select-circle.checked {
  background: var(--momo-color-brand);
  border-color: var(--momo-color-brand);
}
.task-card.bulk-selected { box-shadow: 0 0 0 2px var(--momo-color-brand); }
.task-grid-item.bulk-selected { box-shadow: 0 0 0 2px var(--momo-color-brand); }

.task-cards { display: flex; flex-direction: column; gap: 10px; }

.task-card {
  display: flex; gap: 12px; padding: 12px;
  background: var(--momo-color-bg-soft);
  border: 1px solid var(--momo-color-border-soft);
  border-radius: var(--momo-radius-md);
  transition: box-shadow 0.2s;
  position: relative;
}
.task-card:hover { box-shadow: var(--momo-shadow-sm); }

.task-thumb {
  width: 140px; height: 140px; flex-shrink: 0;
  border-radius: var(--momo-radius-sm); overflow: hidden;
  background: var(--momo-color-bg-muted);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.task-thumb img { width: 100%; height: 100%; object-fit: cover; }

/* Thumb status placeholder (loading / empty / retry) */
.thumb-status {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; width: 100%; height: 100%; color: var(--momo-color-text-tertiary);
}
.thumb-status-text {
  font-size: var(--momo-font-size-xs); color: var(--momo-color-text-secondary);
}
.grid-thumb-status {
  position: absolute; inset: 0;
}

.task-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

/* Header row */
.task-header { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; height: 22px; overflow: hidden; flex-shrink: 0; }
.task-status-group { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.task-duration { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); }
.task-model { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); }
.task-res { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); }
.task-time { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-placeholder); margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; overflow: hidden; flex-shrink: 0; }
.task-remark-row { display: flex; align-items: center; justify-content: flex-end; gap: 2px; max-width: 180px; }
.task-remark { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); min-width: 0; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-remark-input {
  width: 160px;
  height: 24px;
  padding: 0 var(--momo-space-2);
  border: 1px solid var(--momo-color-border);
  border-radius: var(--momo-radius-sm);
  background: var(--momo-color-bg);
  color: var(--momo-color-text);
  font: inherit;
  font-size: var(--momo-font-size-sm);
  outline: none;
}
.task-remark-input:focus {
  border-color: var(--momo-color-brand);
  box-shadow: 0 0 0 2px var(--momo-color-ring);
}
.task-content-row { display: flex; align-items: flex-start; gap: 12px; flex: 1; min-height: 0; }
.task-content-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

/* Prompt */
.task-prompt {
  font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary);
  display: flex; align-items: center; gap: 4px;
  height: 20px; overflow: hidden; flex-shrink: 0;
}
.task-prompt-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-error-msg {
  font-size: var(--momo-font-size-sm); color: var(--momo-color-danger); max-width: 200px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.grid-error-msg {
  font-size: var(--momo-font-size-sm); color: var(--momo-color-danger); margin-left: 6px;
  max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Actions */
.task-actions {
  display: flex; flex-direction: column; gap: 4px;
  flex-shrink: 0; width: 96px;
}
.task-actions :is(button, a) { width: 100%; justify-content: flex-start; }

/* ─── Grid View ─── */
.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.task-grid-item {
  border-radius: var(--momo-radius-md); overflow: hidden;
  background: var(--momo-color-bg-soft);
  border: 1px solid var(--momo-color-border-soft);
  transition: box-shadow 0.2s;
  display: flex; flex-direction: column;
  position: relative;
}
.task-grid-item:hover { box-shadow: var(--momo-shadow-sm); }

.grid-thumb {
  aspect-ratio: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--momo-color-bg-muted);
  position: relative; overflow: hidden;
}
.grid-thumb img { width: 100%; height: 100%; object-fit: cover; }
.grid-progress-bar {
  position: absolute; bottom: 0; left: 0; height: 3px;
  background: var(--momo-color-brand);
  transition: width 0.3s ease;
}

.grid-card-info {
  padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  flex: 1; overflow: hidden;
}
.grid-info-row { display: flex; align-items: center; }
.grid-info-row.prompt-row { align-items: flex-start; }
.gi-value { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); }
.gi-value.prompt-text {
  flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--momo-color-text);
}
.gi-value.time { color: var(--momo-color-text-placeholder); }
.grid-duration { margin-left: 6px; font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); }

.grid-card-actions {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 6px 10px;
  border-top: 1px solid var(--momo-color-border-soft);
}
.grid-card-actions > :is(button, a) { width: 100%; }

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
  border: 1px solid var(--momo-color-border-soft);
}

/* 并排卡片：无 ID 行后放大参考图，使中间三行总高恰等于左侧结果图 140px（22 状态 + 20 提示词 + 4+86 参考图 + 8 间距） */
.task-input-thumbs .input-thumb-img { width: 86px; height: 86px; }
</style>
