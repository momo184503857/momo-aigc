import { ref, computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useServerStatusStore } from '@/stores/serverStatus'
import { taskApi } from '@/services/taskApi'
import { pointsApi } from '@/services/pointsApi'
import { generateImage } from '@/services/imageGeneration'
import { ossApi } from '@/services/ossApi'
import { getTaskStatus } from '@/adapter/toapisClient'
import { translateError } from '@/utils/errors'
import { downloadUrl } from '@/utils/download'
import type { ModelId } from '@/types/adapter'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import type { TaskItem } from '@/components/TaskList.vue'

// ─── Module-level singleton state ───

// Listen for canvas task creation events to refresh task list
let _canvasEventListenerAdded = false
function ensureCanvasEventListener(loadHistoryFn: () => void) {
  if (_canvasEventListenerAdded) return
  _canvasEventListenerAdded = true
  window.addEventListener('canvas:task-created', () => {
    // Delay slightly to ensure DB write completes
    setTimeout(loadHistoryFn, 500)
  })
}

const tasks = ref<TaskItem[]>([])
const loading = ref(false)
const viewMode = ref<'list' | 'grid'>('list')
const userPoints = ref(0)

let pollTimer: ReturnType<typeof setInterval> | null = null

// Bulk mode
const bulkMode = ref(false)
const selectedIds = ref(new Set<number>())

// Pagination
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// Filters
const filterFeatureId = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')
const filterFeature = ref('')
const filterDateRange = ref<[Date, Date] | null>(null)

// Compare dialog
const compareVisible = ref(false)
const compareInitialIndex = ref(0)
const compareTaskId = ref<number>(0)

// Copy params event (for intra-workspace communication)
const copyParamsEvent = ref<{ task: TaskItem; ts: number } | null>(null)

const ACTIVE_STATUSES = ['submitted', 'queued', 'in_progress']

const hasActiveJobs = computed(() =>
  tasks.value.some((t) => ACTIVE_STATUSES.includes(t.status))
)

const activeTaskCount = computed(() =>
  tasks.value.filter((t) => ACTIVE_STATUSES.includes(t.status)).length
)

const featureOptions = computed(() => {
  const opts = [{ id: '', label: '全部功能' }, { id: 'free-gen', label: '自由生图' }]
  for (const key of Object.keys(FEATURE_CONFIGS)) {
    opts.push({ id: key, label: FEATURE_CONFIGS[key].label })
  }
  return opts
})

const dateShortcuts = [
  { text: '当天', value: () => { const d = new Date(); return [d, d] as [Date, Date] } },
  { text: '近三天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 2); return [s, e] as [Date, Date] } },
  { text: '近七天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 6); return [s, e] as [Date, Date] } },
  { text: '当月', value: () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)] as [Date, Date] } },
]

// ─── Helpers ───

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function importResultUrls(taskId: string, sourceUrls: string[]): Promise<string[]> {
  const importedUrls: string[] = []
  for (const sourceUrl of sourceUrls) {
    const imported = await ossApi.importResult(taskId, sourceUrl)
    console.info('[OSS] Result imported', {
      taskId,
      sizeBytes: imported.sizeBytes,
      sourceConnectedMs: imported.sourceConnectedMs,
      totalMs: imported.totalMs,
    })
    importedUrls.push(imported.publicUrl)
  }
  return importedUrls
}

// ─── Composable ───

export function useTaskManager() {
  const { success, info, warning, error, confirmDanger } = useUiFeedback()
  const serverStatus = useServerStatusStore()
  const router = useRouter()

  // ─── Points ───

  async function loadUserPoints() {
    try {
      const res = await pointsApi.getMyBalance()
      userPoints.value = res.data.data?.balance ?? 0
    } catch { /* ignore */ }
  }

  // ─── Bulk mode ───

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

  // ─── Filters ───

  function applyFilters() {
    filterFeatureId.value = filterFeature.value
    if (filterDateRange.value) {
      filterStartDate.value = formatDate(filterDateRange.value[0])
      filterEndDate.value = formatDate(filterDateRange.value[1]) + ' 23:59:59'
    } else {
      filterStartDate.value = ''
      filterEndDate.value = ''
    }
    page.value = 1
    loadHistory()
  }

  // ─── Load history ───

  async function loadHistory() {
    loading.value = true
    try {
      const res = await taskApi.list({
        page: page.value,
        pageSize: pageSize.value,
        feature_id: filterFeatureId.value || undefined,
        start_date: filterStartDate.value || undefined,
        end_date: filterEndDate.value || undefined,
      })
      const records = res.data.data?.records || []
      total.value = res.data.data?.total || 0

      // Merge: keep in-progress local tasks that haven't appeared in API response yet
      const apiTasks: TaskItem[] = records.map((r: any) => ({ ...r }))
      const apiTaskIds = new Set(apiTasks.map(t => t.id))
      const localPending = tasks.value.filter(
        t => !t.id && (t.status === 'submitted' || t.status === 'queued' || t.status === 'in_progress')
      )
      // Also keep tasks that are polling (have toapis_task_id but not yet in API response)
      const localPolling = tasks.value.filter(
        t => t.id && !apiTaskIds.has(t.id) && (t.status === 'submitted' || t.status === 'queued' || t.status === 'in_progress')
      )
      tasks.value = [...localPending, ...localPolling, ...apiTasks]
    } catch (e) {
      console.error('Load history error:', e)
    } finally {
      loading.value = false
    }
  }

  // Register canvas task event listener
  ensureCanvasEventListener(loadHistory)

  function handlePageChange(p: number) {
    page.value = p
    loadHistory()
  }

  function handlePageSizeChange(s: number) {
    pageSize.value = s
    page.value = 1
    loadHistory()
  }

  // ─── Generate ───

  async function handleGenerate(params: {
    modelId: ModelId
    prompt: string
    resolution: string
    aspectRatio: string
    count: number
    templateUrls: string[]
    tempImageFiles: File[]
    refImages?: Array<{ url?: string; file?: File }>
    featureId?: string
    userPrompt?: string
    systemPrompt?: string
    supplementaryImages?: { name: string; url: string }[]
  }) {
    if (!serverStatus.sharedKeyConfigured) {
      warning('管理员尚未配置共享 API Key')
      return
    }

    const cnt = Math.max(1, Math.min(5, params.count))

    for (let i = 0; i < cnt; i++) {
      const newTask = reactive<TaskItem>({
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
        user_prompt: params.userPrompt || '',
        supplementaryImages: params.supplementaryImages,
      })

      tasks.value.unshift(newTask)

      try {
        const result = await generateImage({
          model: params.modelId,
          prompt: params.prompt,
          userPrompt: params.userPrompt,
          systemPrompt: params.systemPrompt,
          size: params.aspectRatio,
          resolution: params.resolution,
          imageUrls: params.templateUrls,
          tempImageFiles: params.tempImageFiles,
          refImages: params.refImages,
          featureId: params.featureId,
          supplementaryImages: params.supplementaryImages,
        })

        newTask.toapis_task_id = result.toapisTaskId
        newTask.id = result.dbTaskId
        newTask.input_image_urls = result.allImageUrls

        await pollTask(newTask)

      } catch (e: any) {
        if (e?.response?.status === 402) {
          const msg = e.response.data?.error || '积分不足，请先充值'
          warning(msg)
          tasks.value = tasks.value.filter(t => t !== newTask)
          await loadUserPoints()
          return
        }
        // 验证错误（如缺少提示词）直接提示，不创建失败任务
        if (e?.message && !e?.response) {
          warning(e.message)
          tasks.value = tasks.value.filter(t => t !== newTask)
          return
        }
        newTask.status = 'failed'
        newTask.error_message = translateError(e)
        if (!newTask.id && newTask.toapis_task_id) {
          tasks.value.unshift(newTask)
        }
        error(e)
      }

      if (i < cnt - 1) {
        await sleep(2000)
      }
    }
  }

  // ─── Polling ───

  async function pollAllTasks() {
    for (const task of tasks.value) {
      if (task.status === 'completed' || task.status === 'failed') continue
      if (!task.toapis_task_id) continue
      try {
        await pollTask(task)
      } catch { /* ignore */ }
    }
  }

  async function pollTask(task: TaskItem) {
    try {
      const result = await getTaskStatus(task.toapis_task_id)

      const statusMap: Record<string, string> = {
        queued: 'queued',
        in_progress: 'in_progress',
        completed: 'completed',
        failed: 'failed',
      }

      if (result.status === 'completed') {
        // Generation is complete now. OSS transfer is a separate UI state.
        task.status = 'completed'
        task.progress = 100
        task.completed_at = new Date().toISOString()
        task.is_importing = true
        await taskApi.update(task.id, {
          status: 'completed',
          progress: 100,
          result_image_urls: [],
          completed_at: task.completed_at,
          expires_at: result.expiresAt,
        })
        try {
          const importedUrls = await importResultUrls(task.toapis_task_id, result.resultUrls)
          task.result_image_urls = importedUrls
          task.error_message = ''
          await taskApi.update(task.id, {
            result_image_urls: importedUrls,
            error_message: '',
          })
        } catch (err) {
          task.result_image_urls = []
          task.error_message = '结果转存 OSS 失败，请点击重新加载'
          await taskApi.update(task.id, {
            status: 'completed',
            progress: 100,
            result_image_urls: [],
            error_message: task.error_message,
            expires_at: result.expiresAt,
          })
          console.warn('[OSS] Result import failed; ToAPIs URL was not exposed:', err)
        } finally {
          task.is_importing = false
        }
      } else if (result.status === 'failed') {
        task.status = 'failed'
        task.progress = result.progress
        task.error_message = result.errorMessage || ''
        await taskApi.update(task.id, {
          status: 'failed',
          progress: result.progress,
          error_code: result.errorCode,
          error_message: result.errorMessage,
        })
      } else {
        task.status = statusMap[result.status] || result.status
        task.progress = result.progress
        await taskApi.update(task.id, {
          status: task.status,
          progress: task.progress,
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

  // Watch active jobs: start/stop polling
  watch(hasActiveJobs, (active) => {
    if (active) {
      startPolling()
    } else {
      stopPolling()
    }
  })

  // ─── Task operations ───

  async function handleRegenerate(task: TaskItem) {
    // Navigate to the correct page if not there
    const currentRoute = router.currentRoute.value
    const isPhotography = task.feature_id === 'ai-photography'
    const targetRouteName = isPhotography ? 'Photography' : 'Workspace'
    const targetRoutePath = isPhotography ? '/photography' : '/workspace'

    if (currentRoute.name !== targetRouteName) {
      sessionStorage.setItem('regenerate_task', JSON.stringify({
        model: task.model,
        resolution: task.resolution,
        aspectRatio: task.aspectRatio,
        userPrompt: task.user_prompt || '',
        input_image_urls: task.input_image_urls || [],
        feature_id: task.feature_id,
        supplementaryImages: task.supplementaryImages,
      }))
      router.push(targetRoutePath)
      info(isPhotography ? '已跳转到AI摄影，参数已复制到表单' : '已跳转到工作台，请点击生成按钮')
      return
    }

    // For photography, regenerate directly using stored prompt + image URLs
    if (isPhotography) {
      const supplementary = task.supplementaryImages || []
      await handleGenerate({
        modelId: task.model,
        prompt: task.prompt,
        resolution: task.resolution,
        aspectRatio: task.aspectRatio,
        count: 1,
        templateUrls: [],
        tempImageFiles: [],
        refImages: (task.input_image_urls || []).map((url: string) => ({ url })),
        featureId: 'ai-photography',
        userPrompt: task.user_prompt || '',
        systemPrompt: '',  // Already baked into task.prompt
        supplementaryImages: supplementary,
      })
      return
    }

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
      await confirmDanger({ title: '确认删除', message: '确定要删除该任务记录吗？', confirmText: '删除', cancelText: '取消' })
      tasks.value = tasks.value.filter((t) => t.id !== task.id)
      success('已移除')
    } catch { /* cancelled */ }
  }

  async function handleDownload(task: TaskItem) {
    const url = task.result_image_urls?.[0]
    if (!url) { warning('没有可下载的图片'); return }
    try {
      await downloadUrl(url, task.toapis_task_id || `任务${task.id}`)
    } catch {
      error('下载失败')
    }
  }

  function handleCopyParams(task: TaskItem) {
    const currentRoute = router.currentRoute.value
    const isPhotography = task.feature_id === 'ai-photography'
    const targetRouteName = isPhotography ? 'Photography' : 'Workspace'
    const targetRoutePath = isPhotography ? '/photography' : '/workspace'

    if (currentRoute.name !== targetRouteName) {
      sessionStorage.setItem('regenerate_task', JSON.stringify({
        model: task.model,
        resolution: task.resolution,
        aspectRatio: task.aspectRatio,
        userPrompt: task.user_prompt || '',
        input_image_urls: task.input_image_urls || [],
        feature_id: task.feature_id,
        supplementaryImages: task.supplementaryImages,
      }))
      router.push(targetRoutePath)
      info(isPhotography ? '已跳转到AI摄影页面，参数已复制' : '已跳转到工作台，参数已复制')
      return
    }
    // On target page: emit event for page to handle
    copyParamsEvent.value = { task, ts: Date.now() }
  }

  // ─── Batch operations ───

  async function handleBatchDownload() {
    const selected = tasks.value.filter((t) => selectedIds.value.has(t.id) && t.result_image_urls?.[0])
    if (selected.length === 0) { warning('所选任务没有可下载的图片'); return }

    loading.value = true
    let count = 0
    for (const task of selected) {
      try {
        await downloadUrl(task.result_image_urls[0], task.toapis_task_id || `任务${task.id}`)
        count++
        await new Promise((r) => setTimeout(r, 300))
      } catch { /* skip */ }
    }
    loading.value = false
    success(`已下载 ${count} 张图片`)
  }

  async function handleBatchPackDownload() {
    await handleBatchDownload()
  }

  async function handleBatchDelete() {
    const selected = tasks.value.filter((t) => selectedIds.value.has(t.id))
    if (selected.length === 0) { warning('请先选择要删除的任务'); return }

    try {
      await confirmDanger({
        title: '批量删除',
        message: `确定要删除选中的 ${selected.length} 个任务吗？此操作不可撤销。`,
        confirmText: '删除',
        cancelText: '取消',
      })
    } catch { return }

    const ids = new Set(selected.map((t) => t.id))
    tasks.value = tasks.value.filter((t) => !ids.has(t.id))
    selectedIds.value.clear()
    success(`已删除 ${selected.length} 个任务`)
  }

  // ─── Retry import ───

  async function retryImportTask(task: TaskItem) {
    if (!task.toapis_task_id) {
      warning('任务尚未提交，无法刷新')
      return
    }
    task.is_importing = true
    try {
      const result = await getTaskStatus(task.toapis_task_id)
      if (result.status === 'completed' && result.resultUrls.length > 0) {
        if (!task.completed_at) {
          task.completed_at = new Date().toISOString()
        }
        const importedUrls = await importResultUrls(task.toapis_task_id, result.resultUrls)
        task.result_image_urls = importedUrls
        task.error_message = ''
        await taskApi.update(task.id, {
          status: 'completed',
          progress: 100,
          result_image_urls: importedUrls,
          error_message: '',
          completed_at: task.completed_at,
        })
        success('图片已刷新')
      } else if (result.status !== 'completed') {
        warning('任务尚未完成，请稍后再试')
      } else {
        warning('暂无结果图')
      }
    } catch (e: any) {
      error('刷新失败: ' + (e.message || '未知错误'))
    } finally {
      task.is_importing = false
    }
  }

  // ─── Detail / Compare ───

  function showCompare(index: number) {
    const task = tasks.value[index]
    compareTaskId.value = task?.id || 0
    compareInitialIndex.value = index
    compareVisible.value = true
  }

  // ─── Lifecycle ───

  async function init() {
    await loadHistory()
    if (hasActiveJobs.value) startPolling()
    loadUserPoints()
  }

  function cleanup() {
    stopPolling()
  }

  return {
    // State
    tasks,
    loading,
    viewMode,
    userPoints,
    bulkMode,
    selectedIds,
    page,
    pageSize,
    total,
    filterFeature,
    filterDateRange,
    featureOptions,
    dateShortcuts,
    hasActiveJobs,
    activeTaskCount,
    compareVisible,
    compareInitialIndex,
    compareTaskId,
    copyParamsEvent,

    // Methods
    init,
    cleanup,
    loadHistory,
    loadUserPoints,
    handleGenerate,
    handleRegenerate,
    handleDelete,
    handleDownload,
    handleCopyParams,
    handleBatchDownload,
    handleBatchPackDownload,
    handleBatchDelete,
    retryImportTask,
    toggleBulkMode,
    handleToggleSelect,
    selectAllTasks,
    applyFilters,
    handlePageChange,
    handlePageSizeChange,
    showCompare,
    startPolling,
    stopPolling,
  }
}
