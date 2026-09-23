<script setup lang="ts">
/**
 * 批量传表格做图 —— Excel 驱动的批量生图
 *
 * 三段流程（上传 → 校对 → 生成）保留原有 step 状态机，但预览表与进度表合并为同一张
 * 表（生成阶段多出「状态 / 结果」两列），避免切换步骤时重挂载与双滚动条；表头吸顶，
 * 参数与主操作收进底部常驻命令栏。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Download,
  FileText,
  LoaderCircle,
  Minus,
  RefreshCw,
  TriangleAlert,
} from '@lucide/vue'
import * as XLSX from 'xlsx'
import { downloadUrl } from '@/utils/download'
import { useUiFeedback, confirmDialog } from '@/composables/useUiFeedback'
import { useServerStatusStore } from '@/stores/serverStatus'
import { generationApi } from '@/services/generationApi'
import { pointsApi } from '@/services/pointsApi'
import { submitTask } from '@/services/imageGeneration'
import { translateError } from '@/utils/errors'
import { formatCredits } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import type { ModelId } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'
import ModelChannelSelect from '@/components/ModelChannelSelect.vue'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const router = useRouter()
const { success, warning, error } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Types ───

interface TableRow {
  id: number
  filename: string
  prompt: string
  imageUrls: string[]
  selected: boolean
  status: 'pending' | 'submitting' | 'in_progress' | 'completed' | 'failed'
  progress: number
  resultUrl?: string
  taskId?: number
  toapisTaskId?: string
  errorMsg?: string
}

// ─── State ───

type Step = 'upload' | 'preview' | 'generating'
const step = ref<Step>('upload')
const fileInputRef = ref<HTMLInputElement | null>(null)
const tableData = ref<TableRow[]>([])
const nextId = ref(1)

// Model params
const modelCatalog = useModelCatalogStore()
const selectedModelId = ref(0)
const resolution = ref('')
const aspectRatio = ref('')

// 目录加载完成后初始化默认模型
modelCatalog.ensureLoaded().then(() => {
  if (!selectedModelId.value) {
    const m = modelCatalog.defaultImageModel
    if (m?.capabilities) {
      selectedModelId.value = m.id
      resolution.value = m.capabilities.resolutions[0]
      aspectRatio.value = modelCatalog.aspectRatiosFor(m, resolution.value)[0] ?? '1:1'
    }
  }
})

const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedModelId.value))
const availableResolutions = computed(() => selectedModel.value?.capabilities?.resolutions || [])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return modelCatalog.aspectRatiosFor(selectedModel.value, resolution.value)
})
const unitPrice = computed(() => modelCatalog.priceFor(selectedModel.value, resolution.value) ?? 0)

function handleModelChange() {
  const model = selectedModel.value
  if (model?.capabilities) {
    if (!model.capabilities.resolutions.includes(resolution.value)) {
      resolution.value = model.capabilities.resolutions[0]
    }
    aspectRatio.value = modelCatalog.aspectRatiosFor(model, resolution.value)[0]
  }
}

function handleResolutionChange() {
  const model = selectedModel.value
  if (model) {
    const ratios = modelCatalog.aspectRatiosFor(model, resolution.value)
    if (!ratios.includes(aspectRatio.value)) {
      aspectRatio.value = ratios[0]
    }
  }
}

// ─── Selection ───

const selectedRows = computed(() => tableData.value.filter(r => r.selected))
const selectedCount = computed(() => selectedRows.value.length)
const allSelected = computed(() => tableData.value.length > 0 && tableData.value.every(r => r.selected))
const someSelected = computed(() => tableData.value.some(r => r.selected) && !allSelected.value)

function toggleAll() {
  const newVal = !allSelected.value
  tableData.value.forEach(r => { r.selected = newVal })
}

// ─── Progress ───

const completedCount = computed(() => tableData.value.filter(r => r.status === 'completed' || r.status === 'failed').length)
const failedRows = computed(() => tableData.value.filter(r => r.status === 'failed'))
const progressPercent = computed(() => {
  if (tableData.value.length === 0) return 0
  return Math.round((completedCount.value / tableData.value.length) * 100)
})
const isGenerating = computed(() => step.value === 'generating')
const allDone = computed(() => isGenerating.value && completedCount.value === tableData.value.length)

// ─── 纯视图派生：命令栏与页头需要的汇总 ───

const successCount = computed(() => tableData.value.filter(r => r.status === 'completed').length)
const runningCount = computed(() =>
  tableData.value.filter(r => r.status === 'in_progress' || r.status === 'submitting').length,
)
/** 选中行里仍可提交的部分（失败行可通过「重试」再次提交） */
const selectedFailedCount = computed(() => selectedRows.value.filter(r => r.status === 'failed').length)
const selectedCost = computed(() => Math.round(unitPrice.value * selectedCount.value * 1000) / 1000)
const imageTotal = computed(() =>
  selectedRows.value.reduce((sum, r) => sum + r.imageUrls.length, 0),
)

/** 页头步骤指示 */
const steps = computed(() => [
  { label: '上传表格', done: tableData.value.length > 0 },
  { label: '校对任务', done: isGenerating.value },
  { label: '批量生成', done: allDone.value },
])

const STATUS_META: Record<TableRow['status'], { label: string; badge: 'secondary' | 'warning' | 'success' | 'destructive' }> = {
  pending: { label: '等待中', badge: 'secondary' },
  submitting: { label: '提交中', badge: 'warning' },
  in_progress: { label: '生成中', badge: 'warning' },
  completed: { label: '成功', badge: 'success' },
  failed: { label: '失败', badge: 'destructive' },
}

/** 行详情（仅查看，表格内容不可编辑） */
const detailRow = ref<TableRow | null>(null)
const detailOpen = ref(false)
function openDetail(row: TableRow) {
  detailRow.value = row
  detailOpen.value = true
}

function fileTail(url: string): string {
  const tail = url.split('?')[0].split('/').pop()
  return tail || url
}

// ─── Template download ───

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['文件名(可选)', '提示词(必填)', '图片链接(必填)'],
    ['示例_01', '将模特衣服换成红色连衣裙', 'https://example.com/model.jpg'],
  ])
  ws['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 50 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '任务列表')
  XLSX.writeFile(wb, '批量做图模板.xlsx')
}

// ─── File upload & parse ───

function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const reader = new FileReader()
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws)

      if (json.length === 0) {
        warning('表格为空，请检查内容')
        return
      }

      // Validate columns
      const firstRow = json[0]
      const keys = Object.keys(firstRow)
      const hasFilename = keys.some(k => k.includes('文件名') || k.includes('filename'))
      const hasPrompt = keys.some(k => k.includes('提示词') || k.includes('prompt'))
      const hasImages = keys.some(k => k.includes('图片') || k.includes('image') || k.includes('链接'))

      if (!hasFilename || !hasPrompt || !hasImages) {
        error('表格必须包含「文件名」「提示词」「图片链接」三列')
        return
      }

      const filenameKey = keys.find(k => k.includes('文件名') || k.includes('filename'))!
      const promptKey = keys.find(k => k.includes('提示词') || k.includes('prompt'))!
      const imageKey = keys.find(k => k.includes('图片') || k.includes('image') || k.includes('链接'))!

      const rows: TableRow[] = json.map((row) => {
        const rawUrls = String(row[imageKey] || '')
        const urls = rawUrls.split(/[,，]/).map(u => u.trim()).filter(Boolean)
        return {
          id: nextId.value++,
          filename: String(row[filenameKey] || '').trim(),
          prompt: String(row[promptKey] || '').trim(),
          imageUrls: urls,
          selected: true,
          status: 'pending' as const,
          progress: 0,
        }
      }).filter(r => r.prompt && r.imageUrls.length > 0)

      if (rows.length === 0) {
        warning('未找到有效数据行，请检查表格内容')
        return
      }

      tableData.value = rows
      step.value = 'preview'
      success(`已解析 ${rows.length} 条任务`)
    } catch (err: any) {
      error('文件解析失败：' + (err.message || '未知错误'))
    }
  }
  reader.readAsArrayBuffer(file)
}

// ─── Generate ───

let pollTimers: ReturnType<typeof setInterval>[] = []

async function handleGenerate() {
  if (selectedCount.value === 0) {
    warning('请至少选择一条任务')
    return
  }

  const count = selectedCount.value
  const total = Math.round(unitPrice.value * count * 1000) / 1000

  try {
    const costText = `预计消耗：${formatCredits(total)}`
    await confirmDialog(
      `选中任务：${count} 个\n${costText}`,
      '确认提交',
      { confirmText: '确认提交', cancelText: '取消' }
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

  // Filter to selected rows
  const toSubmit = tableData.value.filter(r => r.selected)
  step.value = 'generating'

  let submitted = 0

  for (let i = 0; i < toSubmit.length; i++) {
    const row = toSubmit[i]
    row.status = 'submitting'

    try {
      // 调用统一入口 submitTask（服务端编排）
      const result = await submitTask({
        logicalModelId: selectedModelId.value,
        prompt: row.prompt,
        size: aspectRatio.value,
        resolution: resolution.value,
        refImages: row.imageUrls.map(url => ({ url })),
      })

      row.taskId = result.dbTaskId
      row.toapisTaskId = result.taskNo
      row.status = 'in_progress'
      row.progress = 0

      window.dispatchEvent(new CustomEvent('canvas:task-created'))
      submitted++

      // Start polling this row
      startPollingRow(row)

      if (i < toSubmit.length - 1) {
        await sleep(3000)
      }
    } catch (e: any) {
      if (e?.response?.status === 402) {
        warning(e.response.data?.error || '积分不足，已停止提交')
        row.status = 'failed'
        row.errorMsg = '积分不足'
        // Mark remaining as failed
        toSubmit.slice(i + 1).forEach(r => {
          r.status = 'failed'
          r.errorMsg = '未提交'
        })
        break
      }
      const msg = e?.response?.data?.error || translateError(e)
      row.status = 'failed'
      row.errorMsg = msg
      error(`第 ${i + 1} 条提交失败：${msg}`)
      // Continue with next
    }
  }

  if (submitted > 0) {
    success(`成功提交 ${submitted} 个任务`)
  }
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
        row.status = 'completed'
        row.resultUrl = result.resultUrls[0]
        row.progress = 100
        clearInterval(timer)
      } else if (result.status === 'failed') {
        row.status = 'failed'
        row.errorMsg = result.errorMessage || '生成失败'
        clearInterval(timer)
      }
    } catch {
      // ignore poll error, keep polling
    }
  }, 4000)
  pollTimers.push(timer)
}

// ─── Retry ───

async function retryRow(row: TableRow) {
  if (!row.toapisTaskId) return
  row.status = 'submitting'
  row.errorMsg = undefined
  row.progress = 0

  try {
    // 调用统一入口 submitTask（服务端编排）
    const result = await submitTask({
      logicalModelId: selectedModelId.value,
      prompt: row.prompt,
      size: aspectRatio.value,
      resolution: resolution.value,
      refImages: row.imageUrls.map(url => ({ url })),
    })

    row.taskId = result.dbTaskId
    row.toapisTaskId = result.taskNo
    row.status = 'in_progress'
    row.progress = 0

    window.dispatchEvent(new CustomEvent('canvas:task-created'))
    startPollingRow(row)
  } catch (e: any) {
    const msg = e?.response?.data?.error || translateError(e)
    row.status = 'failed'
    row.errorMsg = msg
    error(`重试失败：${msg}`)
  }
}

async function retryFailed() {
  const toRetry = tableData.value.filter(r => r.status === 'failed' && r.selected)
  if (toRetry.length === 0) {
    warning('没有选中的失败任务')
    return
  }
  for (const row of toRetry) {
    await retryRow(row)
    await sleep(3000)
  }
}

// ─── Download ───

const downloadableRows = computed(() => tableData.value.filter(r => r.status === 'completed' && r.resultUrl && r.selected))

async function downloadDirect() {
  if (downloadableRows.value.length === 0) {
    warning('没有可下载的结果')
    return
  }
  let count = 0
  for (const row of downloadableRows.value) {
    try {
      await downloadUrl(row.resultUrl!, String(row.filename || Date.now()))
      count++
      await sleep(300)
    } catch { /* skip */ }
  }
  success(`已下载 ${count} 张图片`)
}

async function downloadZip() {
  await downloadDirect()
}

// ─── Helpers ───

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function truncateUrl(url: string, max = 40): string {
  return url.length > max ? url.slice(0, max) + '…' : url
}

function goBack() {
  if (step.value === 'generating') return
  if (step.value === 'preview') {
    step.value = 'upload'
    return
  }
  router.push('/toolbox')
}

// ─── Lifecycle ───

onMounted(() => {
  serverStatus.fetchStatus()
})

onUnmounted(() => {
  pollTimers.forEach(t => clearInterval(t))
})
</script>

<template>
  <PageLayout>
    <template #header>
      <div class="flex min-w-0 items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="上一步"
          :title="step === 'generating' ? '生成过程中不可返回' : undefined"
          :disabled="step === 'generating'"
          @click="goBack"
        >
          <ArrowLeft class="size-4" />
        </Button>
        <div class="min-w-0">
          <h2 class="truncate">批量传表格做图</h2>
          <p class="text-muted-foreground truncate text-[12.5px]">
            <template v-if="step === 'upload'">一行 = 一个任务：文件名可选，提示词与图片链接必填</template>
            <template v-else>
              共 {{ tableData.length }} 条 · 已选 {{ selectedCount }} 条 · 参考图 {{ imageTotal }} 张
            </template>
          </p>
        </div>
      </div>
    </template>

    <template #extra>
      <ol class="border-border mr-1 hidden items-center gap-1.5 border-r pr-4 md:flex">
        <li v-for="(s, i) in steps" :key="s.label" class="flex items-center gap-1.5 text-[12px]">
          <span
            class="flex size-4 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums"
            :class="s.done ? 'border-success bg-success text-white' : 'border-border text-muted-foreground'"
          >
            <CircleCheck v-if="s.done" class="size-2.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span :class="s.done ? 'text-foreground' : 'text-muted-foreground'">{{ s.label }}</span>
          <ChevronRight v-if="i < steps.length - 1" class="text-muted-foreground/40 size-3" />
        </li>
      </ol>

      <Badge v-if="step !== 'upload'" variant="secondary" class="tabular-nums">
        {{ selectedCount }} / {{ tableData.length }} 已选
      </Badge>
      <Badge v-if="failedRows.length" variant="destructive" class="tabular-nums">
        {{ failedRows.length }} 失败
      </Badge>
      <Button variant="outline" size="sm" class="gap-1.5" @click="downloadTemplate">
        <Download class="size-3.5" />
        下载模板
      </Button>
    </template>

    <!-- API Key warning -->
    <Alert v-if="serverStatus.loaded && !serverStatus.canGenerate" variant="warning" class="content-max mb-4">
      <TriangleAlert />
      <AlertTitle>暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型</AlertTitle>
    </Alert>

    <!-- Step 1: Upload -->
    <div v-if="step === 'upload'" class="content-narrow flex flex-col gap-4">
      <section class="border-border bg-muted/20 rounded-lg border border-dashed px-4 py-5">
        <div class="flex flex-wrap items-center gap-4">
          <span class="border-border bg-background text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border">
            <FileText class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <h3 class="text-[13px] font-semibold">选择填好的 Excel 文件</h3>
            <p class="text-muted-foreground mt-0.5 text-[12px]">
              支持 .xlsx / .xls；解析后进入校对页，可逐条勾选后再提交。
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button variant="outline" @click="downloadTemplate"><Download />下载模板</Button>
            <Button @click="fileInputRef?.click()"><FileText />上传表格</Button>
            <input ref="fileInputRef" type="file" accept=".xlsx,.xls" hidden @change="handleFileUpload" />
          </div>
        </div>
      </section>

      <!-- 列格式说明：原先只有一句灰字，现在是可对照填写的规格 -->
      <section class="border-border overflow-hidden rounded-lg border">
        <h3 class="text-muted-foreground border-border bg-muted/40 border-b px-3 py-1.5 text-[11px] font-medium tracking-wider uppercase">
          表格列格式
        </h3>
        <dl class="divide-border divide-y text-[12.5px]">
          <div class="flex items-baseline gap-3 px-3 py-2">
            <dt class="w-28 shrink-0 font-medium">文件名</dt>
            <dd class="text-muted-foreground min-w-0 flex-1">可选，仅用于下载时命名，留空则用时间戳</dd>
            <dd class="text-muted-foreground/70 shrink-0 text-[11px]">示例_01</dd>
          </div>
          <div class="flex items-baseline gap-3 px-3 py-2">
            <dt class="w-28 shrink-0 font-medium">
              提示词 <span class="text-destructive">*</span>
            </dt>
            <dd class="text-muted-foreground min-w-0 flex-1">必填，为该行生成任务的实际描述</dd>
            <dd class="text-muted-foreground/70 shrink-0 text-[11px]">将模特衣服换成红色连衣裙</dd>
          </div>
          <div class="flex items-baseline gap-3 px-3 py-2">
            <dt class="w-28 shrink-0 font-medium">
              图片链接 <span class="text-destructive">*</span>
            </dt>
            <dd class="text-muted-foreground min-w-0 flex-1">必填，多个链接用半角/全角逗号分隔，作为参考图</dd>
            <dd class="text-muted-foreground/70 shrink-0 text-[11px]">https://…/a.jpg,https://…/b.jpg</dd>
          </div>
        </dl>
        <p class="text-muted-foreground border-border bg-muted/30 border-t px-3 py-2 text-[11.5px]">
          提示词或图片链接为空的行会在解析时被跳过；列名包含「文件名 / 提示词 / 图片 / 链接」即可自动识别。
        </p>
      </section>
    </div>

    <!-- Step 2 + 3: 同一张表（预览 / 生成进度） -->
    <div v-if="step !== 'upload'" class="content-max min-w-0">
      <div class="batch-surface border-border bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="sticky top-0 z-10 w-9 bg-muted">
                <Checkbox
                  :model-value="allSelected ? true : someSelected ? 'indeterminate' : false"
                  aria-label="全选"
                  @update:model-value="toggleAll"
                />
              </TableHead>
              <TableHead class="sticky top-0 z-10 w-9 bg-muted text-[11px] font-normal tabular-nums">#</TableHead>
              <TableHead class="sticky top-0 z-10 w-36 bg-muted">文件名</TableHead>
              <TableHead class="sticky top-0 z-10 min-w-52 bg-muted">提示词</TableHead>
              <TableHead class="sticky top-0 z-10 w-24 bg-muted">参考图</TableHead>
              <template v-if="step === 'generating'">
                <TableHead class="sticky top-0 z-10 w-40 bg-muted">状态</TableHead>
                <TableHead class="sticky top-0 z-10 w-16 bg-muted">结果</TableHead>
              </template>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="(row, i) in tableData"
              :key="row.id"
              :data-state="row.selected ? 'selected' : undefined"
            >
              <TableCell>
                <Checkbox
                  :model-value="row.selected"
                  :aria-label="`选择第 ${i + 1} 条任务`"
                  @update:model-value="(v) => (row.selected = v === true)"
                />
              </TableCell>
              <TableCell class="text-muted-foreground text-[11px] tabular-nums">{{ i + 1 }}</TableCell>
              <TableCell class="max-w-36 truncate text-[12.5px]" :title="row.filename">
                {{ row.filename || '—' }}
              </TableCell>
              <TableCell class="max-w-96 p-0">
                <button
                  type="button"
                  class="hover:bg-muted/60 block w-full cursor-pointer truncate px-2 py-2 text-left text-[12.5px] transition-colors"
                  :title="row.prompt"
                  @click="openDetail(row)"
                >
                  {{ row.prompt }}
                </button>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-1.5">
                  <img
                    v-for="(url, j) in row.imageUrls.slice(0, 2)"
                    :key="j"
                    :src="url"
                    class="media-tile size-7 shrink-0"
                    :alt="fileTail(url)"
                    @error="($event.target as HTMLImageElement).style.display='none'"
                  />
                  <span v-if="row.imageUrls.length > 2" class="text-muted-foreground text-[11px] tabular-nums">
                    +{{ row.imageUrls.length - 2 }}
                  </span>
                  <span v-else class="text-muted-foreground text-[11px] tabular-nums">
                    {{ row.imageUrls.length }} 张
                  </span>
                </div>
              </TableCell>
              <template v-if="step === 'generating'">
                <TableCell>
                  <div class="flex items-center gap-2">
                    <Badge
                      :variant="STATUS_META[row.status].badge"
                      class="shrink-0"
                    >
                      <LoaderCircle
                        v-if="row.status === 'submitting' || row.status === 'in_progress'"
                        class="size-3 animate-spin"
                      />
                      <CircleCheck v-else-if="row.status === 'completed'" class="size-3" />
                      <CircleX v-else-if="row.status === 'failed'" class="size-3" />
                      <Minus v-else class="size-3" />
                      {{ STATUS_META[row.status].label }}
                    </Badge>
                    <div v-if="row.status === 'in_progress'" class="min-w-14 flex-1">
                      <div class="bg-muted h-1 w-full overflow-hidden rounded-full">
                        <div class="bg-primary h-full rounded-full transition-all" :style="{ width: row.progress + '%' }" />
                      </div>
                    </div>
                    <span v-if="row.status === 'in_progress'" class="text-muted-foreground text-[11px] tabular-nums">
                      {{ row.progress }}%
                    </span>
                  </div>
                  <p v-if="row.errorMsg" class="text-destructive/90 mt-1 truncate text-[11px]" :title="row.errorMsg">
                    {{ row.errorMsg }}
                  </p>
                </TableCell>
                <TableCell>
                  <img
                    v-if="row.resultUrl"
                    :src="row.resultUrl"
                    class="media-tile size-10 cursor-pointer"
                    alt="生成结果"
                    @click="openDetail(row)"
                  />
                  <Button
                    v-else-if="row.status === 'failed'"
                    variant="ghost"
                    size="sm"
                    class="text-destructive hover:text-destructive"
                    @click="retryRow(row)"
                  >
                    <RefreshCw />重试
                  </Button>
                </TableCell>
              </template>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <p class="text-muted-foreground mt-2 text-[11.5px]">
        点击提示词或结果缩略图查看该条任务详情；表格内容以 Excel 为准，不在此页编辑。
      </p>
    </div>

    <!-- 常驻命令栏：参数（校对阶段）+ 主操作 + 进度 -->
    <template #footer>
      <div class="content-max flex flex-col gap-2.5">
        <!-- 输出参数：进入生成后不再暴露，避免误改影响「重试」 -->
        <div v-if="step !== 'generating'" class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">参数</span>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-[12px]">模型</span>
            <ModelChannelSelect
              v-model="selectedModelId"
              class="w-64"
              @change="handleModelChange"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-[12px]">分辨率</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              :model-value="resolution"
              @update:model-value="(v) => { if (v) { resolution = String(v); handleResolutionChange() } }"
            >
              <ToggleGroupItem v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground text-[12px]">宽高比</span>
            <Select v-model="aspectRatio">
              <SelectTrigger class="w-28">
                <SelectValue placeholder="宽高比" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="ar in availableAspectRatios" :key="ar" :value="ar">{{ ar }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span class="text-muted-foreground text-[11.5px] tabular-nums">
            单价 {{ formatCredits(unitPrice) }} / 任务
          </span>
        </div>

        <!-- 动作行 -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <template v-if="step === 'preview'">
            <Button size="lg" class="min-w-52 gap-2" :disabled="selectedCount === 0" @click="handleGenerate">
              开始生成 · {{ selectedCount }} 个任务 · {{ formatCredits(selectedCost) }}
            </Button>
            <span v-if="selectedCount === 0" class="text-destructive text-[12px]">
              请至少勾选一条任务
            </span>
            <span v-else class="text-muted-foreground text-[12px]">
              任务按每 3 秒 1 个依次提交，未勾选的行不会提交
            </span>
            <Button variant="outline" size="sm" class="gap-1.5" @click="step = 'upload'">
              <FileText class="size-3.5" />
              重新上传
            </Button>
          </template>

          <div v-else-if="step === 'generating'" class="flex min-w-0 flex-1 flex-col gap-2">
            <div class="flex items-center gap-3">
              <span class="text-[12px] font-medium whitespace-nowrap">
                {{ allDone ? '全部任务已结束' : '正在生成' }}
              </span>
              <Progress
                :model-value="progressPercent"
                class="h-1 w-full max-w-md [&_[data-slot=progress-indicator]]:bg-success"
              />
              <span class="text-muted-foreground text-[11px] tabular-nums whitespace-nowrap">
                {{ completedCount }} / {{ tableData.length }} · 成功 {{ successCount }} · 失败 {{ failedRows.length }} · 进行中 {{ runningCount }}
              </span>
            </div>
            <div v-if="allDone" class="flex flex-wrap items-center gap-2">
              <Button :disabled="downloadableRows.length === 0" @click="downloadDirect">
                <Download />直接下载 {{ downloadableRows.length ? `(${downloadableRows.length})` : '' }}
              </Button>
              <Button
                variant="outline"
                :disabled="downloadableRows.length === 0"
                @click="downloadZip"
              >
                <Download />打包下载
              </Button>
              <Button
                v-if="failedRows.length > 0"
                variant="outline"
                class="gap-1.5"
                @click="retryFailed"
              >
                <RefreshCw class="size-3.5" />
                重试失败项{{ selectedFailedCount ? `（已选 ${selectedFailedCount}）` : '' }}
              </Button>
              <span class="text-muted-foreground text-[11.5px]">
                仅下载已勾选的行
              </span>
            </div>
            <span v-else class="text-muted-foreground text-[12px]">
              结果可下载与重试的入口会在全部任务结束后出现
            </span>
          </div>
        </div>
      </div>
    </template>
  </PageLayout>

  <!-- 行详情（只读） -->
  <Dialog v-model:open="detailOpen">
    <DialogContent class="max-h-[80vh] w-full max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="truncate">
          任务详情{{ detailRow?.filename ? ` · ${detailRow.filename}` : '' }}
        </DialogTitle>
      </DialogHeader>
      <div v-if="detailRow" class="flex flex-col gap-4 text-[13px]">
        <section>
          <h3 class="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">提示词</h3>
          <p class="border-border bg-muted/30 rounded-md border px-2.5 py-2 leading-6 whitespace-pre-wrap">
            {{ detailRow.prompt }}
          </p>
        </section>
        <section>
          <h3 class="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wider uppercase">
            参考图 · {{ detailRow.imageUrls.length }} 张
          </h3>
          <ul class="flex flex-col gap-1.5">
            <li v-for="(url, i) in detailRow.imageUrls" :key="i" class="flex items-center gap-2">
              <img :src="url" class="media-tile size-8 shrink-0" :alt="fileTail(url)" />
              <a
                :href="url"
                target="_blank"
                rel="noopener"
                class="text-primary min-w-0 flex-1 truncate text-[12px] hover:underline"
                :title="url"
              >
                {{ truncateUrl(url, 56) }}
              </a>
            </li>
          </ul>
        </section>
        <section class="border-border flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3">
          <span class="flex items-center gap-2">
            <span class="text-muted-foreground text-[11px] tracking-wider uppercase">状态</span>
            <Badge :variant="STATUS_META[detailRow.status].badge">{{ STATUS_META[detailRow.status].label }}</Badge>
          </span>
          <span v-if="detailRow.progress" class="text-muted-foreground text-[12px] tabular-nums">
            进度 {{ detailRow.progress }}%
          </span>
          <span v-if="detailRow.errorMsg" class="text-destructive text-[12px]">
            {{ detailRow.errorMsg }}
          </span>
        </section>
        <section v-if="detailRow.resultUrl" class="border-border border-t pt-3">
          <h3 class="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wider uppercase">生成结果</h3>
          <img :src="detailRow.resultUrl" class="border-border w-full rounded-md border object-cover" alt="生成结果" />
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/* 表头随 .page-content 吸顶：shadcn Table 自带 overflow-x 容器会截断 sticky，
   这里让该容器不产生滚动，滚动仍由 PageLayout 的 .page-content 承担 */
.batch-surface :deep([data-slot="table-container"]) {
  overflow: visible;
}

/* 表头下沿的分隔线画在 th 上，否则吸顶时会随 tr 一起滚走 */
.batch-surface :deep(thead th) {
  border-bottom: 1px solid var(--border);
}
.batch-surface :deep(thead tr) {
  border-bottom: 0;
}
.batch-surface :deep(thead th:first-child) {
  border-top-left-radius: var(--momo-radius-lg);
}
.batch-surface :deep(thead th:last-child) {
  border-top-right-radius: var(--momo-radius-lg);
}
</style>
