<script setup lang="ts">
import { computed } from 'vue'
import { Refresh, Delete, View, Loading, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { ModelId } from '@/types/adapter'
import { MODELS } from '@/types/adapter'

export interface TaskItem {
  id: number                // server record id
  toapis_task_id: string
  model: ModelId
  prompt: string
  resolution: string
  aspectRatio: string
  status: string            // submitted | queued | in_progress | completed | failed
  progress: number
  result_image_urls: string[]
  input_image_urls: string[]
  template_image_ids: number[]
  error_message: string
  created_at: string
  completed_at: string | null
}

const props = defineProps<{
  tasks: TaskItem[]
  viewMode?: 'list' | 'grid'
  loading?: boolean
}>()

const emit = defineEmits<{
  'regenerate': [task: TaskItem]
  'delete': [task: TaskItem]
  'viewDetail': [task: TaskItem]
}>()

const statusText = computed(() => (status: string) => {
  const map: Record<string, string> = {
    submitted: '已提交',
    queued: '排队中',
    in_progress: '生成中',
    completed: '已完成',
    failed: '生成失败',
    unknown: '状态未知',
  }
  return map[status] || status
})

const statusType = computed(() => (status: string) => {
  const map: Record<string, string> = {
    submitted: 'info',
    queued: 'info',
    in_progress: 'warning',
    completed: 'success',
    failed: 'danger',
    unknown: 'info',
  }
  return map[status] || 'info'
})

function modelDisplayName(modelId: string): string {
  const m = MODELS.find((m) => m.id === modelId)
  return m?.name || modelId
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制'))
}

function promptSummary(text: string): string {
  return text.length > 60 ? text.slice(0, 60) + '...' : text
}
</script>

<template>
  <div class="task-list" v-loading="loading">
    <el-empty v-if="!loading && tasks.length === 0" description="暂无任务" />

    <!-- List View -->
    <div v-if="viewMode !== 'grid'" class="task-cards">
      <div v-for="task in tasks" :key="task.id" class="task-card">
        <div class="task-thumb">
          <img v-if="task.result_image_urls?.[0]" :src="task.result_image_urls[0]" alt="" />
          <el-icon v-else-if="task.status === 'in_progress'" class="is-loading spin" size="28"><Loading /></el-icon>
          <el-icon v-else size="28"><Picture /></el-icon>
        </div>
        <div class="task-body">
          <div class="task-header">
            <el-tag :type="statusType(task.status)" size="small">{{ statusText(task.status) }}</el-tag>
            <span class="task-model">{{ modelDisplayName(task.model) }}</span>
            <span class="task-res">{{ task.resolution }} / {{ task.aspectRatio }}</span>
            <span class="task-time">{{ task.created_at?.slice(0, 16) }}</span>
          </div>
          <div class="task-prompt" @click="copyToClipboard(task.prompt)" title="点击复制">
            {{ promptSummary(task.prompt) }}
          </div>
          <div v-if="task.toapis_task_id" class="task-id" @click="copyToClipboard(task.toapis_task_id)" title="点击复制">
            ID: {{ task.toapis_task_id.slice(0, 20) }}...
          </div>
          <div v-if="task.error_message" class="task-error">{{ task.error_message }}</div>
        </div>
        <div class="task-actions">
          <el-button text :icon="Refresh" size="small" @click="emit('regenerate', task)" title="重新生成" />
          <el-button text :icon="View" size="small" @click="emit('viewDetail', task)" title="查看详情" />
          <el-button text :icon="Delete" size="small" type="danger" @click="emit('delete', task)" title="删除" />
        </div>
      </div>
    </div>

    <!-- Grid View -->
    <div v-else class="task-grid">
      <div v-for="task in tasks" :key="task.id" class="task-grid-item">
        <div class="grid-thumb" @click="emit('viewDetail', task)">
          <img v-if="task.result_image_urls?.[0]" :src="task.result_image_urls[0]" alt="" />
          <el-icon v-else-if="task.status === 'in_progress'" class="is-loading spin" size="32"><Loading /></el-icon>
          <el-icon v-else size="32"><Picture /></el-icon>
        </div>
        <div class="grid-footer">
          <el-tag :type="statusType(task.status)" size="small">{{ statusText(task.status) }}</el-tag>
          <el-button text :icon="Refresh" size="small" @click="emit('regenerate', task)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-list { min-height: 200px; }

.task-cards { display: flex; flex-direction: column; gap: 10px; }

.task-card {
  display: flex; gap: 12px; padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: var(--tf-radius-md, 8px);
  transition: box-shadow 0.2s;
}
.task-card:hover { box-shadow: var(--el-box-shadow-light); }

.task-thumb {
  width: 80px; height: 80px; flex-shrink: 0;
  border-radius: 6px; overflow: hidden;
  background: var(--el-fill-color);
  display: flex; align-items: center; justify-content: center;
}
.task-thumb img { width: 100%; height: 100%; object-fit: cover; }

.task-body { flex: 1; min-width: 0; }
.task-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.task-model { font-weight: 500; color: var(--el-text-color-primary); font-size: 13px; }
.task-res { color: var(--el-text-color-secondary); font-size: 12px; }
.task-time { color: var(--el-text-color-placeholder); font-size: 12px; margin-left: auto; }
.task-prompt {
  font-size: 13px; color: var(--el-text-color-regular);
  cursor: pointer; word-break: break-all;
}
.task-id {
  font-size: 11px; color: var(--el-text-color-placeholder);
  cursor: pointer; margin-top: 4px;
}
.task-error { font-size: 12px; color: var(--el-color-danger); margin-top: 4px; }
.task-actions { display: flex; flex-direction: column; gap: 2px; }

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.task-grid-item {
  border-radius: 8px; overflow: hidden;
  background: var(--el-fill-color-lighter);
}
.grid-thumb {
  aspect-ratio: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: var(--el-fill-color);
}
.grid-thumb img { width: 100%; height: 100%; object-fit: cover; }
.grid-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px;
}

.spin { animation: spin-anim 1s linear infinite; }
@keyframes spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
