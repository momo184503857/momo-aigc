import { ref, computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { generationApi } from '@/services/generationApi'
import { pointsApi } from '@/services/pointsApi'
import { submitTask } from '@/services/imageGeneration'
import { translateError } from '@/utils/errors'
import { downloadUrl } from '@/utils/download'
import { ossApi } from '@/services/ossApi'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import type { TaskItem } from '@/components/TaskList.vue'

/**
 * 全局任务面板管理（ai-provider 重构版）。
 *
 * 变化（相对旧版）：
 *  - 提交走服务端编排（imageGeneration.submitTask → POST /api/generations）；
 *  - 轮询走 GET /api/generations/:id/status（按内部任务 id，不再用 toapis 任务号）；
 *  - 结果转存/失败退款全部由服务端完成，前端只读状态；
 *  - 任务号展示/复制/下载命名使用 task_no（gen-YYYYMMDDHHRRRR）。
 */

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

// importing 为服务端内部过渡态（转存抢占），对前端视作进行中
const ACTIVE_STATUSES = ['submitted', 'queued', 'in_progress', 'importing']

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
      const res = await generationApi.list({
        page: page.value,
        pageSize: pageSize.value,
        feature_id: filterFeatureId.value || undefined,
        start_date: filterStartDate.value || undefined,
        end_date: filterEndDate.value || undefined,
      })
      const records = res.data.data?.records || []
      total.value = res.data.data?.total || 0

      // Merge: keep in-progress local tasks that haven't appeared in API response yet
      const apiTasks: TaskItem[] = records.map((r: any) => ({
        ...r,
        aspectRatio: r.aspectRatio ?? r.aspect_ratio,  // snake_case → camelCase 映射
        task_no: r.taskNo ?? r.task_no,
      }))
      const apiTaskIds = new Set(apiTasks.map(t => t.id))
      const localPending = tasks.value.filter(
        t => !t.id && (t.status === 'submitted' || t.status === 'queued' || t.status === 'in_progress')
      )
      // Also keep tasks that are polling (have db id but not yet in API response)
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
    channelModelId: number
    prompt: string
    resolution: string
    aspectRatio: string
    count: number
    refImages?: Array<{ url?: string; file?: File }>
    featureId?: string
    userPrompt?: string
    systemPrompt?: string
    supplementaryImages?: { name: string; url: string }[]
    promptSegments?: Record<string, string>
    negativePrompt?: string
    suiteId?: number
    pointIndex?: number
  }) {
    if (!serverStatus.canGenerate) {
      warning('暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型')
      return
    }
    if (!params.channelModelId) {
      warning('请先选择模型')
      return
    }

    const cnt = Math.max(1, Math.min(5, params.count))

    // 乐观任务的模型名就地取自目录：提交/轮询响应都不含 model，缺了任务列表会显示空模型
    const optimisticModelId = useModelCatalogStore().getModel(params.channelModelId)?.modelId ?? ''

    for (let i = 0; i < cnt; i++) {
      const newTask = reactive<TaskItem>({
        id: 0,
        task_no: '',
        provider_task_id: '',
        toapis_task_id: '',
        model: optimisticModelId,
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
        // 调用核心模块提交任务（服务端编排：校验/计价/落库/派发）
        const result = await submitTask({
          channelModelId: params.channelModelId,
          prompt: params.prompt,
          userPrompt: params.userPrompt,
          systemPrompt: params.systemPrompt,
          size: params.aspectRatio,
          resolution: params.resolution,
          refImages: params.refImages,
          featureId: params.featureId,
          n: 1,
          supplementaryImages: params.supplementaryImages,
          promptSegments: params.promptSegments,
          negativePrompt: params.negativePrompt,
          suiteId: params.suiteId,
          pointIndex: params.pointIndex,
        })

        newTask.id = result.dbTaskId
        newTask.task_no = result.taskNo
        newTask.input_image_urls = result.inputImageUrls

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
      if (!task.id) continue
      try {
        await pollTask(task)
      } catch { /* ignore */ }
    }
  }

  async function pollTask(task: TaskItem) {
    try {
      // 单次查询：由 pollAllTasks + setInterval 定时器驱动；
      // 服务端在轮询路径内查上游状态并完成转存/退款
      const res = await generationApi.getStatus(task.id)
      const result = res.data.data

      task.status = result.status
      task.progress = result.progress ?? 0
      if (result.providerTaskId) task.provider_task_id = result.providerTaskId
      if (result.status === 'completed') {
        task.completed_at = result.completedAt ?? new Date().toISOString()
        task.result_image_urls = result.resultUrls ?? []
        if ((result.resultUrls ?? []).length === 0) {
          // 转存失败：服务端保留原始 URL，提示重新加载（S5）
          task.error_message = '结果转存失败，请点击重新加载'
        } else if (task.error_message === '结果转存失败，请点击重新加载') {
          task.error_message = ''
        }
      } else if (result.status === 'failed') {
        task.error_message = result.errorMessage || ''
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
    const isFreeGen = !task.feature_id || task.feature_id === 'free-gen'
    const targetRouteName = isPhotography ? 'Photography' : isFreeGen ? 'FreeGen' : 'Workspace'
    const targetRoutePath = isPhotography ? '/photography' : isFreeGen ? '/free-gen' : '/workspace'

    if (currentRoute.name !== targetRouteName) {
      sessionStorage.setItem('regenerate_task', JSON.stringify({
        model: task.model,
        prompt: task.prompt,
        resolution: task.resolution,
        aspectRatio: task.aspectRatio,
        userPrompt: task.user_prompt || '',
        input_image_urls: task.input_image_urls || [],
        feature_id: task.feature_id,
        supplementaryImages: task.supplementaryImages,
      }))
      router.push(targetRoutePath)
      info(
        isPhotography ? '已跳转到AI摄影，参数已复制到表单'
        : isFreeGen ? '已跳转到自由生图，请点击生成按钮'
        : '已跳转到工作台，请点击生成按钮'
      )
      return
    }

    // For photography, regenerate directly using stored prompt + image URLs
    if (isPhotography) {
      const supplementary = task.supplementaryImages || []
      await handleGenerate({
        channelModelId: resolveChannelModelId(task),
        prompt: task.prompt,
        resolution: task.resolution,
        aspectRatio: task.aspectRatio,
        count: 1,
        refImages: (task.input_image_urls || []).map((url: string) => ({ url })),
        featureId: 'ai-photography',
        userPrompt: task.user_prompt || '',
        systemPrompt: '',  // Already baked into task.prompt
        supplementaryImages: supplementary,
      })
      return
    }

    await handleGenerate({
      channelModelId: resolveChannelModelId(task),
      prompt: task.prompt,
      resolution: task.resolution,
      aspectRatio: task.aspectRatio,
      count: 1,
      refImages: (task.input_image_urls || []).map((url: string) => ({ url })),
      featureId: task.feature_id,
    })
  }

  /** 按任务快照的模型名反查渠道模型 id（目录中同名模型；查不到时提示选择） */
  function resolveChannelModelId(task: TaskItem): number {
    const catalog = useModelCatalogStore()
    const m = catalog.getModelByName(task.model)
    return m?.id ?? 0
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
      await downloadUrl(url, task.task_no || task.toapis_task_id || `任务${task.id}`)
    } catch {
      error('下载失败')
    }
  }

  function handleCopyParams(task: TaskItem) {
    const currentRoute = router.currentRoute.value
    const isPhotography = task.feature_id === 'ai-photography'
    const isFreeGen = !task.feature_id || task.feature_id === 'free-gen'
    const targetRouteName = isPhotography ? 'Photography' : isFreeGen ? 'FreeGen' : 'Workspace'
    const targetRoutePath = isPhotography ? '/photography' : isFreeGen ? '/free-gen' : '/workspace'

    if (currentRoute.name !== targetRouteName) {
      sessionStorage.setItem('regenerate_task', JSON.stringify({
        model: task.model,
        prompt: task.prompt,
        resolution: task.resolution,
        aspectRatio: task.aspectRatio,
        userPrompt: task.user_prompt || '',
        input_image_urls: task.input_image_urls || [],
        feature_id: task.feature_id,
        supplementaryImages: task.supplementaryImages,
      }))
      router.push(targetRoutePath)
      info(
        isPhotography ? '已跳转到AI摄影页面，参数已复制'
        : isFreeGen ? '已跳转到自由生图页面，参数已复制'
        : '已跳转到工作台，参数已复制'
      )
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
        await downloadUrl(task.result_image_urls[0], task.task_no || task.toapis_task_id || `任务${task.id}`)
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

  // ─── Retry import（转存失败重试，服务端执行）───

  async function retryImportTask(task: TaskItem) {
    if (!task.id) {
      warning('任务尚未提交，无法刷新')
      return
    }
    task.is_importing = true
    try {
      const res = await generationApi.reimport(task.id)
      task.result_image_urls = res.data.data?.resultUrls ?? []
      task.error_message = ''
      success('图片已刷新')
    } catch (e: any) {
      error('刷新失败: ' + (e?.response?.data?.error || e.message || '未知错误'))
    } finally {
      task.is_importing = false
    }
  }

  // ─── Image editor result: upload + navigate to generate ───

  async function handleEditDone(
    result: { dataUrl: string; file: File; sourceUrl?: string },
    task: TaskItem | null,
  ) {
    try {
      // Upload edited image to OSS (inputs scope) so it can be used as a reference image
      const { publicUrl } = await ossApi.upload(result.file, 'inputs')

      // Determine target route based on the originating task's feature
      const isPhotography = task?.feature_id === 'ai-photography'
      const isFreeGen = !task?.feature_id || task?.feature_id === 'free-gen'
      const targetRoutePath = isPhotography ? '/photography' : isFreeGen ? '/free-gen' : '/workspace'

      // Reuse the regenerate_task sessionStorage pathway: inject the edited
      // image as the sole input image so it lands in the reference slot.
      sessionStorage.setItem('regenerate_task', JSON.stringify({
        model: task?.model,
        prompt: task?.prompt || '',
        resolution: task?.resolution || '',
        aspectRatio: task?.aspectRatio || '',
        userPrompt: task?.user_prompt || '',
        input_image_urls: [publicUrl],
        feature_id: task?.feature_id,
        supplementaryImages: task?.supplementaryImages,
      }))

      const { push } = router
      await push(targetRoutePath)
      info('编辑后的图片已加入参考图，请点击生成')
    } catch (e) {
      error(e, '编辑图片上传失败')
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
    handleEditDone,
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
