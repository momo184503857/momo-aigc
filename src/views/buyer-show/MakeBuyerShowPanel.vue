<script setup lang="ts">
import { DsFileInput } from '@/components/design-system'
/**
 * MakeBuyerShowPanel — 制作买家秀（AI买家秀 · Tab 1）
 *
 * 流程：下载/上传 Excel（商品ID / 1:1主图1链接 / 提示词）→ 列表（主图缩略图 + 可编辑提示词 + 勾选）
 *      → 统一选参数（模型/分辨率/比例默认9:16/张数默认1）→ 一键生图（逐行调用现有生图，feature_id='buyer-show'）
 *      → 结果缩略图点击弹对比弹窗 → 多选结果一键打包 zip（按商品ID命名）。
 *
 * 批次持久化到 buyer_show_batch_items，刷新后用 toapis_task_id 恢复轮询。
 * 生图复用 generation_tasks，故任务同时出现在全局任务列表。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Archive,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Wand2,
} from '@lucide/vue'
import * as XLSX from 'xlsx'

import { downloadRowsAsZip } from '@/utils/buyerShowZip'

import { useUiFeedback, promptDialog, confirmDialog } from '@/composables/useUiFeedback'
import { useServerStatusStore } from '@/stores/serverStatus'
import { pointsApi } from '@/services/pointsApi'
import { submitTask } from '@/services/imageGeneration'
import { generationApi } from '@/services/generationApi'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { buyerShowBatchApi } from '@/services/buyerShowBatchApi'
import type { BatchItemRow } from '@/services/buyerShowBatchApi'
import { translateError } from '@/utils/errors'
import { formatCredits } from '@/types/adapter'
import { UiImagePreview, UiEmptyState } from '@/components/design-system'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import ModelChannelSelect from '@/components/ModelChannelSelect.vue'
import type { TaskItem } from '@/components/TaskList.vue'
import { Alert, AlertTitle } from '@/components/design-system/primitives/alert'
import { Badge } from '@/components/design-system/primitives/badge'
import { Button } from '@/components/design-system/primitives/button'
import { Checkbox } from '@/components/design-system/primitives/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/design-system/primitives/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/design-system/primitives/table'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/design-system/primitives/toggle-group'

const { success, warning, error, confirmDanger } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Types ───

interface TableRow {
  id: number // buyer_show_batch_items.id
  productId: string
  mainImageUrl: string
  prompt: string
  selected: boolean
  status: 'pending' | 'submitting' | 'in_progress' | 'completed' | 'failed'
  progress: number
  /** 关联的 generation_tasks.id（行级轮询/恢复轮询的键） */
  taskId: number | null
  /** 业务任务号（展示用；原渠道任务号已退役） */
  toapisTaskId: string | null
  resultUrl?: string
  resultImageUrls?: string[]
  inputImageUrls?: string[]
  errorMsg?: string
  model?: string
  resolution?: string
  aspectRatio?: string
  n?: number
  submittedAt?: number // 提交/重提时刻，用于判定「快速失败」自动重试
  autoRetryCount: number // 本行已自动重试次数（达上限后转为终态失败）
}

// ─── State ───

const fileInputRef = ref<InstanceType<typeof DsFileInput> | null>(null)
const tableData = ref<TableRow[]>([])
const currentBatchId = ref<string | null>(null) // 当前任务（active 批次）的 batch_id
const isGenerating = ref(false)
const zipping = ref(false)

// 统一生图参数（默认比例 9:16、张数 1）
const modelCatalog = useModelCatalogStore()
const selectedModelId = ref(0)
const resolution = ref('') // '2K'
const aspectRatio = ref('9:16')
const countN = ref(1)

const selectedModel = computed(() => modelCatalog.getModel(selectedModelId.value))
const availableResolutions = computed(() => selectedModel.value?.capabilities?.resolutions || [])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return modelCatalog.aspectRatiosFor(selectedModel.value, resolution.value)
})
const unitPrice = computed(() => modelCatalog.priceFor(selectedModel.value, resolution.value) ?? 0)

// 目录加载后初始化默认模型（买家秀默认 9:16）
modelCatalog.ensureLoaded().then(() => {
  if (!selectedModelId.value) {
    const m = modelCatalog.defaultImageModel
    if (m?.capabilities) {
      selectedModelId.value = m.id
      resolution.value = m.capabilities.resolutions.includes('2K') ? '2K' : m.capabilities.resolutions[0]
      const ratios = modelCatalog.aspectRatiosFor(m, resolution.value)
      aspectRatio.value = ratios.includes('9:16') ? '9:16' : (ratios[0] ?? '9:16')
    }
  }
})

function handleModelChange() {
  const model = selectedModel.value
  if (model?.capabilities) {
    if (!model.capabilities.resolutions.includes(resolution.value)) {
      resolution.value = model.capabilities.resolutions[0]
    }
    const ratios = modelCatalog.aspectRatiosFor(model, resolution.value)
    if (!ratios.includes(aspectRatio.value)) aspectRatio.value = ratios[0]
  }
}

function handleResolutionChange() {
  const model = selectedModel.value
  if (model) {
    const ratios = modelCatalog.aspectRatiosFor(model, resolution.value)
    if (!ratios.includes(aspectRatio.value)) aspectRatio.value = ratios[0]
  }
}

// ─── Selection（行内 Checkbox 直接写 row.selected，表头 Checkbox 全选）───

const selectedRows = computed(() => tableData.value.filter(r => r.selected))
const selectedCount = computed(() => selectedRows.value.length)

const allSelected = computed(() => tableData.value.length > 0 && tableData.value.every(r => r.selected))
const someSelected = computed(() => tableData.value.some(r => r.selected) && !allSelected.value)

function toggleAll() {
  const newVal = !allSelected.value
  tableData.value.forEach(r => { r.selected = newVal })
}

const submittableRows = computed(() =>
  selectedRows.value.filter(r => r.status === 'pending' || r.status === 'failed')
)
const submittableCount = computed(() => submittableRows.value.length)

const downloadableRows = computed(() =>
  selectedRows.value.filter(r => r.status === 'completed' && r.resultUrl)
)
const downloadableCount = computed(() => downloadableRows.value.length)

const estimateCost = computed(() => {
  if (submittableCount.value === 0) return 0
  return Math.round(unitPrice.value * submittableCount.value * countN.value * 1000) / 1000
})

// ─── Template download ───

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['商品ID', '1:1主图1链接', '提示词'],
    ['1058061462035', 'https://img.alicdn.com/bao/uploaded/i4/xxx/xxx.jpg', '商品标题/风格描述示例'],
  ])
  ws['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '买家秀任务')
  XLSX.writeFile(wb, '买家秀模板.xlsx')
}

// ─── Upload & parse ───

function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const reader = new FileReader()
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws)

      if (json.length === 0) {
        warning('表格为空，请检查内容')
        return
      }

      const firstRow = json[0]
      const keys = Object.keys(firstRow)

      // 模糊匹配三列（兼容「一比一主图一链接」「1:1主图1链接」等写法）
      const productIdKey = keys.find(k =>
        k.includes('商品ID') || k.includes('商品') && k.includes('ID') || k.toLowerCase().includes('product')
      )
      const promptKey = keys.find(k => k.includes('提示词') || k.toLowerCase().includes('prompt'))
      const imageKey = keys.find(k =>
        (k.includes('主图') && (k.includes('1') || k.includes('一'))) ||
        k.includes('1:1') || k.includes('一比一') ||
        ((k.includes('图') || k.toLowerCase().includes('image')) && k.includes('链接'))
      )

      if (!productIdKey || !promptKey || !imageKey) {
        error('表格必须包含「商品ID」「1:1主图1链接」「提示词」三列')
        return
      }

      const items = json.map((row) => ({
        productId: String(row[productIdKey] || '').trim(),
        mainImageUrl: String(row[imageKey] || '').trim(),
        prompt: String(row[promptKey] || '').trim(),
      })).filter(r => r.productId && r.mainImageUrl && r.prompt)

      if (items.length === 0) {
        warning('未找到有效数据行（商品ID/主图链接/提示词 均不可为空）')
        return
      }

      // 弹框收集任务名（可选）；当前已有任务时提示将被自动归档
      const hasCurrent = tableData.value.length > 0
      let name = ''
      try {
        const p = await promptDialog(
          `${hasCurrent ? '当前任务将自动归档为历史。\n' : ''}为这个任务起个名字（可选，留空用「时间 · N个商品」）：`,
          '新建买家秀任务',
          {
            confirmText: '创建任务',
            cancelText: '取消',
            inputPlaceholder: '例如：618女装第一批',
          }
        )
        name = (p.value || '').trim()
      } catch { return }

      const res = await buyerShowBatchApi.createBatch(items, name)
      const batchId: string = res.data.data.batchId
      const ids: number[] = res.data.data.ids
      // 后端已自动归档旧任务；前端停轮询并以新任务替换工作区
      stopAllPolling()
      currentBatchId.value = batchId
      tableData.value = items.map((it, i) => ({
        id: ids[i],
        productId: it.productId,
        mainImageUrl: it.mainImageUrl,
        prompt: it.prompt,
        selected: false,
        status: 'pending',
        progress: 0,
        taskId: null,
        toapisTaskId: null,
        autoRetryCount: 0,
      }))
      success(`已创建任务，导入 ${items.length} 条${hasCurrent ? '，旧任务已归档' : ''}`)
    } catch (err: any) {
      error('文件解析失败：' + (err?.message || '未知错误'))
    }
  }
  reader.readAsArrayBuffer(file)
}

// ─── Load + resume polling ───

function normalizeStatus(s: string): TableRow['status'] {
  if (s === 'completed') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'pending') return 'pending'
  return 'in_progress' // submitted/queued/in_progress/importing
}

function rowFromRecord(r: BatchItemRow): TableRow {
  const resultUrls = r.resultImageUrls || []
  return {
    id: r.id,
    productId: r.productId,
    mainImageUrl: r.mainImageUrl,
    prompt: r.prompt,
    selected: false,
    status: normalizeStatus(r.status),
    progress: r.progress,
    taskId: r.taskId,
    toapisTaskId: r.toapisTaskId,
    resultUrl: resultUrls[0],
    resultImageUrls: resultUrls,
    inputImageUrls: r.inputImageUrls,
    errorMsg: r.errorMessage || undefined,
    model: r.model,
    resolution: r.resolution,
    aspectRatio: r.aspectRatio,
    n: r.n,
    submittedAt: undefined,
    autoRetryCount: 0,
  }
}

async function loadItems() {
  try {
    const res = await buyerShowBatchApi.listItems()
    const records: BatchItemRow[] = res.data.data.records
    tableData.value = records.map(rowFromRecord)
    currentBatchId.value = records.length > 0 ? (records[0].batchId ?? null) : null
    // 恢复未结束任务的轮询
    tableData.value
      .filter(r => r.status === 'in_progress' && r.taskId)
      .forEach(r => startPollingRow(r))
  } catch (err) {
    error(err, '加载批次失败')
  }
}

// ─── Generate ───

/** 提交后在此时间内失败，视为瞬时失败，自动重试 */
const FAST_FAIL_MS = 5000
/** 单行最多自动重试次数（避免对持续失败的任务反复扣分） */
const MAX_AUTO_RETRY = 2

let pollTimers: ReturnType<typeof setInterval>[] = []

function stopAllPolling() {
  pollTimers.forEach(t => clearInterval(t))
  pollTimers = []
}

interface SubmitParams {
  /** 模型名快照（行回显用） */
  model: string
  logicalModelId: number
  resolution: string
  aspectRatio: string
  n: number
}

function currentParams(): SubmitParams {
  return {
    model: selectedModel.value?.displayName ?? selectedModel.value?.modelId ?? '',
    logicalModelId: selectedModelId.value,
    resolution: resolution.value,
    aspectRatio: aspectRatio.value,
    n: countN.value,
  }
}

// 该行原任务参数（重新生成用）；缺失时回落到当前选择器值
function rowOriginalParams(row: TableRow): SubmitParams {
  const cm = row.model ? modelCatalog.getModelByName(row.model) : undefined
  return {
    model: row.model || selectedModel.value?.displayName || '',
    logicalModelId: cm?.id ?? selectedModelId.value,
    resolution: row.resolution || resolution.value,
    aspectRatio: row.aspectRatio || aspectRatio.value,
    n: row.n || 1,
  }
}

/**
 * 对单行提交生图（统一入口）：设置行参数 + submitTask + 回写 task_id/toapis_task_id + 启动轮询。
 * 新任务完成后结果经 task_id 关联自然覆盖旧结果（旧任务记录保留但不再关联）。
 * 成功返回 { ok: true }；失败时行已置 failed 并 persistRowStatus，返回 { ok: false, err }。
 * 不重置 autoRetryCount、不弹提示，由调用方处理。
 */
async function doSubmit(row: TableRow, params: SubmitParams): Promise<{ ok: boolean; err?: any }> {
  row.status = 'submitting'
  row.errorMsg = undefined
  row.progress = 0
  row.model = params.model
  row.resolution = params.resolution
  row.aspectRatio = params.aspectRatio
  row.n = params.n
  row.resultUrl = undefined
  row.resultImageUrls = undefined
  try {
    const result = await submitTask({
      logicalModelId: params.logicalModelId,
      prompt: row.prompt,
      size: params.aspectRatio,
      resolution: params.resolution,
      refImages: [{ url: row.mainImageUrl }],
      featureId: 'buyer-show',
      n: params.n,
    })
    row.taskId = result.dbTaskId
    row.toapisTaskId = result.taskNo
    row.status = 'in_progress'
    row.progress = 0
    row.submittedAt = Date.now()
    await buyerShowBatchApi.updateItem(row.id, {
      status: 'in_progress', taskId: row.taskId, toapisTaskId: result.taskNo, progress: 0, errorMessage: null,
    })
    window.dispatchEvent(new CustomEvent('canvas:task-created'))
    startPollingRow(row)
    return { ok: true }
  } catch (e: any) {
    const msg = e?.response?.data?.error || translateError(e)
    row.status = 'failed'
    row.errorMsg = msg
    await persistRowStatus(row)
    return { ok: false, err: e }
  }
}

async function handleGenerate() {
  if (submittableCount.value === 0) {
    warning('请勾选待生成的行（未生成或失败）')
    return
  }

  const count = submittableCount.value
  const total = estimateCost.value
  try {
    const costText = `预计消耗：${formatCredits(total)}`
    await confirmDialog(
      `选中待生成：${count} 个 × ${countN.value} 张\n${costText}`,
      '确认生成',
      { confirmText: '确认生成', cancelText: '取消' }
    )
  } catch { return }

  // 余额预检（服务端仍会二次校验）
  try {
    const res = await pointsApi.getMyBalance()
    const balance = res.data.data?.balance ?? 0
    if (balance < total) {
      warning(`积分不足，需要 ${formatCredits(total)}，当前余额 ${formatCredits(balance)}`)
      return
    }
  } catch { /* proceed */ }

  const toSubmit = [...submittableRows.value]
  isGenerating.value = true
  let submitted = 0

  for (let i = 0; i < toSubmit.length; i++) {
    const row = toSubmit[i]
    row.autoRetryCount = 0
    const { ok, err } = await doSubmit(row, currentParams())
    if (ok) {
      submitted++
      if (i < toSubmit.length - 1) await sleep(3000)
      continue
    }
    if (err?.response?.status === 402) {
      warning(err.response.data?.error || '积分不足，已停止提交')
      toSubmit.slice(i + 1).forEach(async r => {
        r.status = 'failed'
        r.errorMsg = '未提交'
        await persistRowStatus(r)
      })
      break
    }
    error(`第 ${i + 1} 条提交失败：${row.errorMsg}`)
  }

  isGenerating.value = false
  if (submitted > 0) success(`成功提交 ${submitted} 个任务`)
}

async function persistRowStatus(row: TableRow) {
  try {
    await buyerShowBatchApi.updateItem(row.id, {
      status: row.status, progress: row.progress, errorMessage: row.errorMsg ?? null,
    })
  } catch { /* ignore */ }
}

function startPollingRow(row: TableRow) {
  if (!row.taskId) return
  const timer = setInterval(async () => {
    try {
      // 单次查询（服务端查上游 + 转存）：由 setInterval 定时器驱动
      const res = await generationApi.getStatus(row.taskId!)
      const result = res.data.data
      row.progress = result.progress

      if (result.status === 'completed') {
        const imported = result.resultUrls
        row.status = 'completed'
        row.resultImageUrls = imported
        row.resultUrl = imported[0]
        row.progress = 100
        await persistRowStatus(row)
        clearInterval(timer)
      } else if (result.status === 'failed') {
        // 提交后 5 秒内失败 → 视为瞬时失败，提示并自动重试（达上限后转终态失败）
        const elapsed = row.submittedAt ? Date.now() - row.submittedAt : Infinity
        if (elapsed < FAST_FAIL_MS && row.autoRetryCount < MAX_AUTO_RETRY) {
          clearInterval(timer)
          warning(`「${row.productId || ''}」提交后快速失败，正在自动重试（第 ${row.autoRetryCount + 1}/${MAX_AUTO_RETRY} 次）…`)
          await autoRetry(row)
          return
        }
        row.status = 'failed'
        row.errorMsg = result.errorMessage || '生成失败'
        await persistRowStatus(row)
        clearInterval(timer)
      }
    } catch {
      // 忽略单次轮询错误，继续轮询
    }
  }, 4000)
  pollTimers.push(timer)
}

// ─── Retry single row ───

async function retryRow(row: TableRow) {
  if (isGenerating.value) {
    warning('正在批量生成中，请稍候')
    return
  }
  row.autoRetryCount = 0
  const { ok } = await doSubmit(row, currentParams())
  if (!ok) error(`重试失败：${row.errorMsg}`)
}

// 重新生成（对已完成结果不满意）：用该行原任务参数重提交，新结果覆盖旧结果
async function regenerateRow(row: TableRow) {
  if (isGenerating.value) {
    warning('正在批量生成中，请稍候')
    return
  }
  row.autoRetryCount = 0
  const { ok } = await doSubmit(row, rowOriginalParams(row))
  if (!ok) error(`重新生成失败：${row.errorMsg}`)
}

// 提交后 5 秒内失败的自动重试：用该行参数重新提交并继续轮询
async function autoRetry(row: TableRow) {
  row.autoRetryCount++
  await doSubmit(row, rowOriginalParams(row))
}

// ─── Prompt edit（@change 在失焦/回车时触发，直接保存即可）───

async function onPromptChange(row: TableRow) {
  try {
    await buyerShowBatchApi.updateItem(row.id, { prompt: row.prompt })
  } catch { /* ignore */ }
}

// ─── Delete / clear ───

async function deleteRow(row: TableRow) {
  try {
    await buyerShowBatchApi.deleteItem(row.id)
    const idx = tableData.value.findIndex(r => r.id === row.id)
    if (idx >= 0) tableData.value.splice(idx, 1)
  } catch (err) {
    error(err, '删除失败')
  }
}

// 归档当前任务到任务历史（工作区清空，可在「任务历史」回看）
async function archiveCurrent() {
  if (!currentBatchId.value || tableData.value.length === 0) return
  try {
    await confirmDanger({
      title: '归档当前任务',
      message: `将当前任务（${tableData.value.length} 条）归档到任务历史，工作区将清空。归档后可在「任务历史」查看与下载。`,
      confirmText: '归档',
      cancelText: '取消',
    })
  } catch { return }
  try {
    await buyerShowBatchApi.updateBatch(currentBatchId.value, { status: 'archived' })
    stopAllPolling()
    tableData.value = []
    currentBatchId.value = null
    success('已归档到任务历史')
  } catch (err) {
    error(err, '归档失败')
  }
}

// 清空当前任务（连同其历史记录一并删除）
async function clearAll() {
  if (tableData.value.length === 0) return
  try {
    await confirmDanger({
      title: '清空当前任务',
      message: `将删除当前任务（${tableData.value.length} 条）及其历史记录，且无法恢复。确定继续？`,
      confirmText: '清空',
      cancelText: '取消',
    })
  } catch { return }
  try {
    if (currentBatchId.value) {
      await buyerShowBatchApi.deleteBatch(currentBatchId.value)
    } else {
      await buyerShowBatchApi.deleteAll()
    }
    stopAllPolling()
    tableData.value = []
    currentBatchId.value = null
    success('已清空')
  } catch (err) {
    error(err, '清空失败')
  }
}

// ─── Single image preview ───

const previewVisible = ref(false)
const previewUrl = ref('')
function openPreview(row: TableRow) {
  previewUrl.value = row.mainImageUrl
  previewVisible.value = true
}

// ─── Compare dialog ───

const compareVisible = ref(false)
const compareInitialIndex = ref(0)
const compareTaskId = ref<number | undefined>(undefined)

const compareTasks = computed<TaskItem[]>(() =>
  tableData.value
    .filter(r => r.taskId && r.status === 'completed')
    .map(r => ({
      id: r.taskId as number,
      toapis_task_id: r.toapisTaskId || '',
      model: r.model || selectedModel.value?.modelId || '',
      prompt: r.prompt,
      resolution: r.resolution || resolution.value,
      aspectRatio: r.aspectRatio || aspectRatio.value,
      status: r.status,
      progress: r.progress,
      result_image_urls: r.resultImageUrls || [],
      input_image_urls: r.inputImageUrls && r.inputImageUrls.length ? r.inputImageUrls : [r.mainImageUrl],
      template_image_ids: [],
      error_message: r.errorMsg || '',
      created_at: '',
      completed_at: null,
      feature_id: 'buyer-show',
    }))
)

function openCompare(row: TableRow) {
  const idx = compareTasks.value.findIndex(t => t.id === row.taskId)
  compareInitialIndex.value = idx >= 0 ? idx : 0
  compareTaskId.value = row.taskId || undefined
  compareVisible.value = true
}

// ─── Zip download ───

async function downloadZip() {
  const rows = [...downloadableRows.value]
  if (rows.length === 0) {
    warning('请勾选已完成的可下载结果')
    return
  }
  zipping.value = true
  try {
    const ok = await downloadRowsAsZip(rows, '买家秀')
    if (ok === 0) {
      error('下载失败，结果可能尚未转存完成')
      return
    }
    success(`已打包 ${ok} 张图片`)
  } catch (err) {
    error(err, '打包下载失败')
  } finally {
    zipping.value = false
  }
}

// ─── Helpers ───

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Lifecycle ───

onMounted(() => {
  serverStatus.fetchStatus()
  loadItems()
})

onUnmounted(() => {
  stopAllPolling()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert
      v-if="serverStatus.loaded && !serverStatus.canGenerate"
      variant="warning"
    >
      <TriangleAlert />
      <AlertTitle>暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型</AlertTitle>
    </Alert>

    <!-- 空态 -->
    <div v-if="tableData.length === 0" class="flex flex-col items-center gap-4 pt-12">
      <UiEmptyState title="还没有任务" description="下载模板、填好商品ID/主图链接/提示词后上传，即可批量制作买家秀。" />
      <div class="flex gap-3">
        <Button variant="outline" @click="downloadTemplate"><Download />下载模板</Button>
        <Button @click="fileInputRef?.click()"><FileText />上传表格</Button>
      </div>
    </div>

    <!-- 工作区 -->
    <template v-else>
      <div class="bg-muted flex flex-col gap-3 rounded-lg p-3">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" @click="downloadTemplate"><Download />下载模板</Button>
          <Button @click="fileInputRef?.click()"><FileText />上传新表格</Button>
          <Button variant="outline" :disabled="!currentBatchId" @click="archiveCurrent"><Archive />归档当前任务</Button>
          <Button variant="ghost"  @click="clearAll"><Trash2 />清空当前任务</Button>
          <span class="text-muted-foreground ml-auto text-sm">共 {{ tableData.length }} 条，已选 {{ selectedCount }} 条</span>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <label class="text-muted-foreground text-sm whitespace-nowrap">模型</label>
            <ModelChannelSelect
              v-model="selectedModelId"
              class="w-[360px]"
              @change="handleModelChange"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-muted-foreground text-sm whitespace-nowrap">分辨率</label>
            <ToggleGroup
              type="single"
              variant="outline"
              :model-value="resolution"
              @update:model-value="(v) => { if (v) { resolution = String(v); handleResolutionChange() } }"
            >
              <ToggleGroupItem v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-muted-foreground text-sm whitespace-nowrap">宽高比</label>
            <Select v-model="aspectRatio">
              <SelectTrigger class="w-30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="ar in availableAspectRatios" :key="ar" :value="ar">{{ ar }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-muted-foreground text-sm whitespace-nowrap">张数</label>
            <Select :model-value="String(countN)" @update:model-value="(v) => (countN = Number(v))">
              <SelectTrigger class="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="String(n)">{{ n }} 张</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="border-border flex items-center gap-3 border-t pt-3">
          <span v-if="submittableCount > 0" class="text-success text-sm">预计 {{ formatCredits(estimateCost) }}</span>
          <Button
            :disabled="isGenerating || submittableCount === 0"
            @click="handleGenerate"
          >
            <LoaderCircle v-if="isGenerating" class="animate-spin" /><Wand2 v-else />一键生图 · {{ submittableCount }} 个
          </Button>
          <Button
            variant="outline"
            :disabled="zipping || downloadableCount === 0"
            @click="downloadZip"
          >
            <LoaderCircle v-if="zipping" class="animate-spin" /><Download v-else />一键下载 · {{ downloadableCount }} 张
          </Button>
        </div>
      </div>

      <div class="min-h-0">
        <div class="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-10">
                  <Checkbox
                    :model-value="allSelected ? true : someSelected ? 'indeterminate' : false"
                    @update:model-value="toggleAll"
                  />
                </TableHead>
                <TableHead class="w-[84px]">主图</TableHead>
                <TableHead class="w-[160px]">商品ID</TableHead>
                <TableHead class="min-w-[260px]">提示词</TableHead>
                <TableHead class="w-[120px]">状态</TableHead>
                <TableHead class="w-[96px]">结果</TableHead>
                <TableHead class="w-[120px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="row in tableData"
                :key="row.id"
                :data-state="row.selected && 'selected'"
              >
                <TableCell>
                  <Checkbox
                    :model-value="row.selected"
                    @update:model-value="(v) => (row.selected = v === true)"
                  />
                </TableCell>
                <TableCell>
                  <img
                    v-if="row.mainImageUrl" :src="row.mainImageUrl" class="media-tile size-14 cursor-zoom-in"
                    @error="($event.target as HTMLImageElement).style.opacity = '0.3'"
                    @click="openPreview(row)"
                  />
                </TableCell>
                <TableCell class="max-w-40 truncate" :title="row.productId">{{ row.productId }}</TableCell>
                <TableCell>
                  <Textarea
                    v-model="row.prompt"
                    class="min-h-9"
                    @change="onPromptChange(row)"
                  />
                </TableCell>
                <TableCell>
                  <Badge v-if="row.status === 'pending'" variant="secondary">待生成</Badge>
                  <Badge v-else-if="row.status === 'submitting'" variant="warning">提交中</Badge>
                  <Badge v-else-if="row.status === 'in_progress'" variant="warning">生成中 {{ row.progress }}%</Badge>
                  <Badge v-else-if="row.status === 'completed'" variant="success">成功</Badge>
                  <Badge v-else-if="row.status === 'failed'" variant="destructive" :title="row.errorMsg">失败</Badge>
                </TableCell>
                <TableCell>
                  <img
                    v-if="row.resultUrl" :src="row.resultUrl" class="media-tile size-14 cursor-zoom-in"
                    @click="openCompare(row)"
                  />
                  <Button
                    v-else-if="row.status === 'failed'"
                    variant="ghost"
                    size="sm"

                    @click="retryRow(row)"
                  >
                    <RefreshCw />重试
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    v-if="row.status === 'completed'"
                    variant="ghost"
                    size="sm"

                    @click="regenerateRow(row)"
                  >
                    <RefreshCw />重新生成
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon-sm"

                    @click="deleteRow(row)"
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </template>

    <DsFileInput ref="fileInputRef" type="file" accept=".xlsx,.xls" hidden @change="handleFileUpload" />

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
    <ImageCompareDialog
      v-model="compareVisible" :tasks="compareTasks"
      :initial-index="compareInitialIndex" :task-id="compareTaskId"
    />
  </div>
</template>
