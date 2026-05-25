<script setup lang="ts">
/**
 * WorkspacePage - AI 生图工作台
 * 从 ToolFlux NewAIGeneration.vue 改造：
 *   Electron IPC → 浏览器 fetch / Web API
 *   任务持久化 → 服务器 SQLite
 *   Key 管理 → localStorage
 */
import { ref, computed, watch, onMounted, onUnmounted, onActivated, onDeactivated, nextTick } from 'vue'

// ─── 面板拖拽分割 ───
const leftPanelWidth = ref(600)
const isDragging = ref(false)
const MIN_PANEL_WIDTH = 360
const MAX_LEFT_RATIO = 0.7
let dragContainerRect: DOMRect | null = null

function onSplitterMouseDown(e: MouseEvent) {
  isDragging.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  const container = (e.target as HTMLElement).closest('.workspace-layout')
  dragContainerRect = container?.getBoundingClientRect() ?? null
  e.preventDefault()
}

function onSplitterTouchStart(e: TouchEvent) {
  isDragging.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  const container = (e.target as HTMLElement).closest('.workspace-layout')
  dragContainerRect = container?.getBoundingClientRect() ?? null
  e.preventDefault()
}

function onPointerMove(e: MouseEvent | TouchEvent) {
  if (!isDragging.value || !dragContainerRect) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const contentLeft = dragContainerRect.left + FEATURE_NAV_WIDTH
  const availableWidth = dragContainerRect.width - FEATURE_NAV_WIDTH
  const maxWidth = Math.floor(availableWidth * MAX_LEFT_RATIO)
  const newWidth = clientX - contentLeft
  leftPanelWidth.value = Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, maxWidth))
}

function onPointerUp() {
  isDragging.value = false
  dragContainerRect = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function onPointerLeave() {
  isDragging.value = false
  dragContainerRect = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

defineOptions({ name: 'Workspace' })
import { ElMessage, ElMessageBox } from 'element-plus'
import { List, Grid, Document, Close } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'
import GenerationForm from '@/components/GenerationForm.vue'
import FeatureForm from '@/components/FeatureForm.vue'
import FeatureNav from '@/components/FeatureNav.vue'
import type { TabGroup } from '@/components/FeatureNav.vue'
import TaskList from '@/components/TaskList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import { useKeyConfigStore } from '@/stores/keyConfig'
import { taskApi } from '@/services/taskApi'
import * as toapisClient from '@/adapter/toapisClient'
import { translateError } from '@/utils/errors'
import type { ModelId } from '@/types/adapter'
import type { TaskItem } from '@/components/TaskList.vue'
import JSZip from 'jszip'

const keyStore = useKeyConfigStore()
const generationForm = ref<InstanceType<typeof GenerationForm>>()
const featureForm = ref<InstanceType<typeof FeatureForm>>()

// ─── 功能导航 ───
const FEATURE_NAV_WIDTH = 180
const activeTab = ref('free-gen')

const tabGroups: TabGroup[] = [
  {
    name: '常用功能',
    tabs: [
      { id: 'change-clothes', label: '换衣' },
      { id: 'change-bg', label: '换背景' },
      { id: 'change-face', label: '换脸' },
    ],
  },
  {
    name: '商品素材',
    tabs: [
      { id: 'detail-pic', label: '细节图' },
      { id: 'fabric-pic', label: '面料图' },
      { id: 'flat-pic', label: '平铺图' },
      { id: '3d-pic', label: '3D图' },
    ],
  },
  {
    name: '模特资产',
    tabs: [
      { id: 'model-gen', label: '模特生成' },
      { id: 'three-view', label: '三视图' },
    ],
  },
  {
    name: '高级',
    tabs: [
      { id: 'free-gen', label: '自由生图' },
    ],
  },
]

// ─── 任务列表 ───
const tasks = ref<TaskItem[]>([])
const loading = ref(false)
const viewMode = ref<'list' | 'grid'>('list')
let pollTimer: ReturnType<typeof setInterval> | null = null

// Bulk mode
const bulkMode = ref(false)
const selectedIds = ref(new Set<number>())

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value
  if (!bulkMode.value) selectedIds.value.clear()
}

function handleToggleSelect(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function selectAllTasks() {
  if (selectedIds.value.size === tasks.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(tasks.value.map((t) => t.id))
  }
}

const hasActiveJobs = computed(() =>
  tasks.value.some((t) => t.status === 'submitted' || t.status === 'queued' || t.status === 'in_progress')
)

// ─── 加载历史 ───
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

async function loadHistory() {
  loading.value = true
  try {
    const res = await taskApi.list({ page: page.value, pageSize: pageSize.value })
    const records = res.data.data?.records || []
    total.value = res.data.data?.total || 0
    tasks.value = records.map((r: any) => ({ ...r }))
  } catch (e) {
    console.error('Load history error:', e)
  } finally {
    loading.value = false
  }
}

function handlePageChange(p: number) {
  page.value = p
  loadHistory()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  loadHistory()
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
  featureId?: string
}) {
  if (!keyStore.hasKey) {
    ElMessage.warning('请先填写你的 ToAPIs API Key')
    return
  }

  const cnt = Math.max(1, Math.min(5, params.count))

  for (let i = 0; i < cnt; i++) {
    // Create a placeholder task
    const newTask: TaskItem = {
      id: 0,
      toapis_task_id: '',
      model: params.modelId,
      prompt: params.prompt,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      status: 'submitted',
      progress: 0,
      result_image_urls: [],
      input_image_urls: [],
      template_image_ids: [],
      error_message: '',
      created_at: new Date().toISOString(),
      completed_at: null,
      feature_id: params.featureId,
    }

    try {
      // 1. Upload temp images to ToAPIs
      const allImageUrls: string[] = [...params.templateUrls]
      for (const file of params.tempImageFiles) {
        const url = await toapisClient.uploadImage(keyStore.apiKey, file)
        allImageUrls.push(url)
      }
      newTask.input_image_urls = allImageUrls

      // 2. Create ToAPIs task
      const toapis_task_id = await toapisClient.createTask(keyStore.apiKey, {
        model: params.modelId,
        prompt: params.prompt,
        size: params.aspectRatio,
        resolution: params.resolution,
        imageUrls: allImageUrls,
      })
      newTask.toapis_task_id = toapis_task_id

      // 3. Save to server
      const res = await taskApi.create({
        toapis_task_id,
        model: params.modelId,
        prompt: params.prompt,
        size: params.aspectRatio,
        resolution: params.resolution,
        aspect_ratio: params.aspectRatio,
        n: 1,
        input_image_urls: allImageUrls,
        status: 'submitted',
        progress: 0,
        feature_id: params.featureId,
      })
      newTask.id = res.data.data.id

      // 4. Add to local list
      tasks.value.unshift(newTask)

      // 5. Poll immediately
      await pollTask(newTask)

    } catch (e: any) {
      newTask.status = 'failed'
      newTask.error_message = translateError(e)
      if (!newTask.id && newTask.toapis_task_id) {
        tasks.value.unshift(newTask)
      }
      ElMessage.error(translateError(e))
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
    task.error_message = translateError(e)
  }
}

function startPolling() {
  if (!pollTimer) {
    pollTimer = setInterval(pollAllTasks, 4000)
  }
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// Watch active jobs: stop polling when all tasks finished
watch(hasActiveJobs, (active) => {
  if (active) {
    startPolling()
  } else {
    stopPolling()
  }
})

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
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    ElMessage.success('已移除')
  } catch { /* cancelled */ }
}

// ─── 下载 ───
function handleDownload(task: TaskItem) {
  const url = task.result_image_urls?.[0]
  if (!url) { ElMessage.warning('没有可下载的图片'); return }
  const a = document.createElement('a')
  a.href = url
  a.download = `${task.model}_${task.toapis_task_id?.slice(0, 8) || 'image'}.png`
  a.target = '_blank'
  a.click()
}

// ─── 复制参数 ───
function handleCopyParams(task: TaskItem) {
  const targetTab = task.feature_id || 'free-gen'
  activeTab.value = targetTab
  nextTick(() => {
    const form = targetTab === 'free-gen' ? generationForm.value : featureForm.value
    form?.setParams({
      modelId: task.model,
      prompt: task.prompt,
      resolution: task.resolution,
      aspectRatio: task.aspectRatio,
      referenceImages: (task.input_image_urls || []).map((url: string) => ({
        dataUrl: url,
        sourceUrl: url,
      })),
    })
    ElMessage.success('参数已复制到表单')
  })
}

// ─── 批量操作 ───

async function fetchAsBlob(url: string): Promise<Blob> {
  const token = localStorage.getItem('auth_token')
  const resp = await fetch('/api/proxy/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url }),
  })
  if (!resp.ok) throw new Error('Download failed')
  return resp.blob()
}

function downloadBlob(blob: Blob, filename: string) {
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objUrl)
}

async function handleBatchDownload() {
  const selected = tasks.value.filter((t) => selectedIds.value.has(t.id) && t.result_image_urls?.[0])
  if (selected.length === 0) { ElMessage.warning('所选任务没有可下载的图片'); return }

  loading.value = true
  let count = 0
  for (const task of selected) {
    try {
      const blob = await fetchAsBlob(task.result_image_urls[0])
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      downloadBlob(blob, `${task.model}_${task.toapis_task_id?.slice(0, 8) || 'image'}.${ext}`)
      count++
      await new Promise((r) => setTimeout(r, 300))
    } catch { /* skip */ }
  }
  loading.value = false
  ElMessage.success(`已下载 ${count} 张图片`)
}

async function handleBatchPackDownload() {
  const selected = tasks.value.filter((t) => selectedIds.value.has(t.id) && t.result_image_urls?.[0])
  if (selected.length === 0) { ElMessage.warning('所选任务没有可下载的图片'); return }

  loading.value = true
  const zip = new JSZip()
  let fetched = 0

  for (const task of selected) {
    try {
      const blob = await fetchAsBlob(task.result_image_urls[0])
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      zip.file(`${task.model}_${task.toapis_task_id?.slice(0, 8) || 'image'}.${ext}`, blob)
      fetched++
    } catch { /* skip */ }
  }

  if (fetched === 0) { ElMessage.error('打包失败：无法获取图片'); loading.value = false; return }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `momo-results-${new Date().toISOString().slice(0, 10)}.zip`)
  loading.value = false
  ElMessage.success(`已打包 ${fetched} 张图片`)
}

// ─── 详情 ───

const taskDetailDialog = ref<InstanceType<typeof TaskDetailDialog>>()
const detailTask = ref<TaskItem | null>(null)

function showDetail(task: TaskItem) {
  detailTask.value = task
  nextTick(() => taskDetailDialog.value?.open())
}

const compareVisible = ref(false)
const compareInitialIndex = ref(0)

function showCompare(index: number) {
  compareInitialIndex.value = index
  compareVisible.value = true
}

// ─── 生命周期 ───

onMounted(async () => {
  document.addEventListener('mousemove', onPointerMove)
  document.addEventListener('mouseup', onPointerUp)
  document.addEventListener('mouseleave', onPointerLeave)
  document.addEventListener('touchmove', onPointerMove)
  document.addEventListener('touchend', onPointerUp)

  await loadHistory()
  if (hasActiveJobs.value) startPolling()

  // Check for pending regenerate from cross-page navigation
  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    sessionStorage.removeItem('regenerate_task')
    try {
      const params = JSON.parse(stored)
      await nextTick()
      generationForm.value?.setParams({
        modelId: params.model,
        prompt: params.prompt,
        resolution: params.resolution,
        aspectRatio: params.aspectRatio,
        referenceImages: (params.input_image_urls || []).map((url: string) => ({
          dataUrl: url,
          sourceUrl: url,
        })),
      })
      ElMessage.success('已加载历史任务参数，点击生成按钮即可重新生成')
    } catch { /* ignore parse errors */ }
  }
})

onDeactivated(() => {
  stopPolling()
})

onActivated(async () => {
  await loadHistory()
  if (hasActiveJobs.value) startPolling()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onPointerMove)
  document.removeEventListener('mouseup', onPointerUp)
  document.removeEventListener('mouseleave', onPointerLeave)
  document.removeEventListener('touchmove', onPointerMove)
  document.removeEventListener('touchend', onPointerUp)
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
</script>

<template>
  <PageLayout content-padding="0">
    <div class="workspace-layout">
      <!-- Feature Navigation -->
      <div class="feature-nav" :style="{ width: FEATURE_NAV_WIDTH + 'px' }">
        <FeatureNav :groups="tabGroups" :active-tab="activeTab" @select="activeTab = $event" />
      </div>

      <!-- Content Panel -->
      <div class="content-panel" :style="{ width: leftPanelWidth + 'px' }">
        <GenerationForm v-if="activeTab === 'free-gen'" ref="generationForm"
          @generate="(p) => handleGenerate({ ...p, featureId: 'free-gen' })" />
        <FeatureForm v-else :key="activeTab" ref="featureForm" :feature-id="activeTab"
          @generate="(p) => handleGenerate({ ...p, featureId: activeTab })" />
      </div>

      <!-- Splitter -->
      <div
        class="panel-splitter"
        :class="{ dragging: isDragging }"
        @mousedown="onSplitterMouseDown"
        @touchstart.prevent="onSplitterTouchStart"
      />

      <!-- Right Panel: Tasks -->
      <div class="right-panel">
        <div class="right-header">
          <span class="panel-title">任务列表</span>
          <div class="right-header-actions">
            <template v-if="bulkMode">
              <span class="bulk-count">已选 {{ selectedIds.size }} 项</span>
              <el-button size="small" @click="selectAllTasks">
                {{ selectedIds.size === tasks.length && tasks.length > 0 ? '取消全选' : '全选' }}
              </el-button>
              <el-button size="small" type="primary" :disabled="selectedIds.size === 0" @click="handleBatchDownload">
                批量下载
              </el-button>
              <el-button size="small" type="primary" :disabled="selectedIds.size === 0" @click="handleBatchPackDownload">
                打包下载
              </el-button>
              <el-button size="small" @click="toggleBulkMode">
                <el-icon><Close /></el-icon>取消
              </el-button>
            </template>
            <template v-else>
              <el-tag v-if="hasActiveJobs" type="warning" size="small">生成中...</el-tag>
              <el-button size="small" @click="toggleBulkMode">批量操作</el-button>
              <el-button-group size="small">
                <el-button :type="viewMode === 'list' ? 'primary' : 'default'" @click="viewMode = 'list'">
                  <el-icon><List /></el-icon>
                </el-button>
                <el-button :type="viewMode === 'grid' ? 'primary' : 'default'" @click="viewMode = 'grid'">
                  <el-icon><Grid /></el-icon>
                </el-button>
              </el-button-group>
            </template>
          </div>
        </div>
        <div class="right-body">
          <TaskList
            :tasks="tasks"
            :view-mode="viewMode"
            :loading="loading"
            :bulk-mode="bulkMode"
            :selected-ids="selectedIds"
            @regenerate="handleRegenerate"
            @delete="handleDelete"
            @view-detail="showDetail"
            @download="handleDownload"
            @copy-params="handleCopyParams"
            @compare-images="showCompare"
            @toggle-select="handleToggleSelect"
          />
        </div>
        <div v-if="total > 0 && !bulkMode" class="right-footer">
          <el-pagination
            :current-page="page"
            :page-size="pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="total"
            layout="total, sizes, prev, pager, next"
            :pager-count="5"
            popper-class="pagination-popper"
            @current-change="handlePageChange"
            @size-change="handlePageSizeChange"
          />
        </div>
      </div>
    </div>
  </PageLayout>

  <!-- Task Detail Dialog -->
  <TaskDetailDialog ref="taskDetailDialog" :task="detailTask" @close="detailTask = null" />

  <ImageCompareDialog
    v-model="compareVisible"
    :tasks="tasks"
    :initial-index="compareInitialIndex"
  />

</template>

<style scoped>
.workspace-layout {
  display: flex; height: 100%; gap: 0;
  user-select: none;
}

.feature-nav {
  flex-shrink: 0;
  overflow: hidden;
}

.content-panel {
  flex-shrink: 0;
  padding: 20px; overflow: hidden;
  border-left: 1px solid var(--el-border-color-lighter);
}

.panel-splitter {
  width: 12px; flex-shrink: 0;
  cursor: col-resize;
  background: var(--el-border-color);
  transition: background 0.2s, box-shadow 0.2s;
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.panel-splitter::before,
.panel-splitter::after {
  content: '';
  width: 2px;
  height: 32px;
  border-radius: 1px;
  background: var(--el-text-color-placeholder);
  transition: background 0.2s, height 0.2s;
}

.panel-splitter:hover,
.panel-splitter.dragging {
  background: var(--el-color-primary-light-5);
  box-shadow: 0 0 8px var(--el-color-primary-light-3);
}

.panel-splitter:hover::before,
.panel-splitter:hover::after,
.panel-splitter.dragging::before,
.panel-splitter.dragging::after {
  background: #fff;
  height: 40px;
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
  display: flex; align-items: center; gap: 8px;
}

.bulk-count {
  font-size: 14px; font-weight: 500;
  color: var(--el-color-primary); margin-right: 4px;
}

.right-body {
  flex: 1; overflow-y: auto; padding: 16px 20px;
  animation: fadeIn 0.3s ease-out;
}

.right-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}

</style>
