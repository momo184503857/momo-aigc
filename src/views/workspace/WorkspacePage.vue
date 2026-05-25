<script setup lang="ts">
/**
 * WorkspacePage - AI 生图工作台
 * 从 ToolFlux NewAIGeneration.vue 改造：
 *   Electron IPC → 浏览器 fetch / Web API
 *   任务持久化 → 服务器 SQLite
 *   Key 管理 → localStorage
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { List, Grid } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'
import GenerationForm from '@/components/GenerationForm.vue'
import TaskList from '@/components/TaskList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import { useKeyConfigStore } from '@/stores/keyConfig'
import { taskApi } from '@/services/taskApi'
import * as toapisClient from '@/adapter/toapisClient'
import type { ModelId } from '@/types/adapter'
import type { TaskItem } from '@/components/TaskList.vue'

const keyStore = useKeyConfigStore()
const generationForm = ref<InstanceType<typeof GenerationForm>>()

// ─── 任务列表 ───
const tasks = ref<TaskItem[]>([])
const loading = ref(false)
const viewMode = ref<'list' | 'grid'>('list')
let pollTimer: ReturnType<typeof setInterval> | null = null

const hasActiveJobs = computed(() =>
  tasks.value.some((t) => t.status === 'submitted' || t.status === 'queued' || t.status === 'in_progress')
)

// ─── 加载历史 ───
async function loadHistory() {
  loading.value = true
  try {
    const res = await taskApi.list({ pageSize: 100 })
    const records = res.data.data?.records || []
    // Merge with in-memory tasks (keep active ones)
    const existingIds = new Set(tasks.value.map((t) => t.id))
    for (const r of records) {
      if (!existingIds.has(r.id)) {
        tasks.value.push({ ...r, toapis_task_id: r.toapis_task_id || '' })
        existingIds.add(r.id)
      }
    }
  } catch (e) {
    console.error('Load history error:', e)
  } finally {
    loading.value = false
  }
}

// ─── 生成 ───

async function handleGenerate(params: {
  modelId: ModelId
  prompt: string
  resolution: string
  aspectRatio: string
  count: number
  templateUrls: string[]
  tempImageFiles: File[]
}) {
  if (!keyStore.hasKey) {
    ElMessage.warning('请先填写你的 ToAPIs API Key')
    return
  }

  const cnt = Math.max(1, Math.min(5, params.count))

  for (let i = 0; i < cnt; i++) {
    try {
      // 1. Upload temp images to ToAPIs
      const allImageUrls: string[] = [...params.templateUrls]
      for (const file of params.tempImageFiles) {
        const url = await toapisClient.uploadImage(keyStore.apiKey, file)
        allImageUrls.push(url)
      }

      // 2. Create ToAPIs task
      const toapis_task_id = await toapisClient.createTask(keyStore.apiKey, {
        model: params.modelId,
        prompt: params.prompt,
        size: params.aspectRatio,
        resolution: params.resolution,
        imageUrls: allImageUrls,
      })

      // 3. Save to server
      const res = await taskApi.create({
        toapis_task_id,
        model: params.modelId,
        prompt: params.prompt,
        size: params.aspectRatio,
        resolution: params.resolution,
        n: 1,
        input_image_urls: allImageUrls,
        status: 'submitted',
        progress: 0,
      })

      // 4. Add to local list
      const newTask: TaskItem = {
        id: res.data.data.id,
        toapis_task_id,
        model: params.modelId,
        prompt: params.prompt,
        resolution: params.resolution,
        aspectRatio: params.aspectRatio,
        status: 'submitted',
        progress: 0,
        result_image_urls: [],
        input_image_urls: allImageUrls,
        template_image_ids: [],
        error_message: '',
        created_at: new Date().toISOString(),
        completed_at: null,
      }
      tasks.value.unshift(newTask)

      // 5. Poll immediately
      await pollTask(newTask)

    } catch (e: any) {
      ElMessage.error('生成失败: ' + (e.message || '未知错误'))
    }

    // Delay between batch items
    if (i < cnt - 1) {
      await sleep(2000)
    }
  }
}

// ─── 轮询 ───

async function pollAllTasks() {
  for (const task of tasks.value) {
    if (task.status === 'completed' || task.status === 'failed') continue
    if (!task.toapis_task_id) continue
    try {
      await pollTask(task)
    } catch { /* ignore individual poll errors */ }
  }
}

async function pollTask(task: TaskItem) {
  if (!keyStore.hasKey) return
  try {
    const result = await toapisClient.getTaskStatus(keyStore.apiKey, task.toapis_task_id)

    // Map ToAPIs status to local status
    const statusMap: Record<string, string> = {
      queued: 'queued',
      in_progress: 'in_progress',
      completed: 'completed',
      failed: 'failed',
    }
    task.status = statusMap[result.status] || result.status
    task.progress = result.progress

    // Sync to server
    if (result.status === 'completed') {
      task.result_image_urls = result.resultUrls
      task.completed_at = new Date().toISOString()
      await taskApi.update(task.id, {
        status: 'completed',
        progress: 100,
        result_image_urls: result.resultUrls,
        completed_at: task.completed_at,
        expires_at: result.expiresAt,
      })
    } else if (result.status === 'failed') {
      task.error_message = result.errorMessage || ''
      await taskApi.update(task.id, {
        status: 'failed',
        progress: result.progress,
        error_code: result.errorCode,
        error_message: result.errorMessage,
      })
    } else {
      await taskApi.update(task.id, {
        status: task.status,
        progress: result.progress,
      })
    }
  } catch (e: any) {
    task.status = 'unknown'
    task.error_message = e.message || '查询失败'
  }
}

function startPolling() {
  if (!pollTimer) pollTimer = setInterval(pollAllTasks, 4000)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// ─── 操作 ───

async function handleRegenerate(task: TaskItem) {
  await handleGenerate({
    modelId: task.model,
    prompt: task.prompt,
    resolution: task.resolution,
    aspectRatio: task.aspectRatio,
    count: 1,
    templateUrls: task.input_image_urls || [],
    tempImageFiles: [],
  })
}

async function handleDelete(task: TaskItem) {
  try {
    await ElMessageBox.confirm('确定要删除该任务记录吗？', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    // Cannot delete from server for regular users, just hide
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    ElMessage.success('已移除')
  } catch { /* cancelled */ }
}

// ─── 详情 ───

const taskDetailDialog = ref<InstanceType<typeof TaskDetailDialog>>()
const detailTask = ref<TaskItem | null>(null)

function showDetail(task: TaskItem) {
  detailTask.value = task
  nextTick(() => taskDetailDialog.value?.open())
}

// ─── 生命周期 ───

onMounted(async () => {
  await loadHistory()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
</script>

<template>
  <PageLayout content-padding="0">
    <div class="workspace-layout">
      <!-- Left Panel: Form -->
      <div class="left-panel">
        <GenerationForm ref="generationForm" @generate="handleGenerate" />
      </div>

      <!-- Right Panel: Tasks -->
      <div class="right-panel">
        <div class="right-header">
          <span class="panel-title">任务列表</span>
          <div class="right-header-actions">
            <el-tag v-if="hasActiveJobs" type="warning" size="small">生成中...</el-tag>
            <el-button-group size="small">
              <el-button :type="viewMode === 'list' ? 'primary' : 'default'" @click="viewMode = 'list'">
                <el-icon><List /></el-icon>
              </el-button>
              <el-button :type="viewMode === 'grid' ? 'primary' : 'default'" @click="viewMode = 'grid'">
                <el-icon><Grid /></el-icon>
              </el-button>
            </el-button-group>
          </div>
        </div>
        <div class="right-body">
          <TaskList
            :tasks="tasks"
            :view-mode="viewMode"
            :loading="loading"
            @regenerate="handleRegenerate"
            @delete="handleDelete"
            @view-detail="showDetail"
          />
        </div>
      </div>
    </div>
  </PageLayout>

  <!-- Task Detail Dialog -->
  <TaskDetailDialog ref="taskDetailDialog" :task="detailTask" @close="detailTask = null" />
</template>

<style scoped>
.workspace-layout {
  display: flex; height: 100%; gap: 0;
}

.left-panel {
  width: 360px; flex-shrink: 0;
  padding: 20px; overflow-y: auto;
  border-right: 1px solid var(--el-border-color-lighter);
}

.right-panel {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}

.right-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.panel-title {
  font-size: 16px; font-weight: 600;
  color: var(--el-text-color-primary);
}

.right-header-actions {
  display: flex; align-items: center; gap: 12px;
}

.right-body {
  flex: 1; overflow-y: auto; padding: 16px 20px;
  animation: fadeIn 0.3s ease-out;
}
</style>
