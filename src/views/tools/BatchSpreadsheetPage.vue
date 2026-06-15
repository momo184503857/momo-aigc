<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Download, Document, Refresh } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import { downloadUrl } from '@/utils/download'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useServerStatusStore } from '@/stores/serverStatus'
import { taskApi } from '@/services/taskApi'
import { pointsApi } from '@/services/pointsApi'
import { submitTask, importResultUrls } from '@/services/imageGeneration'
import { getTaskStatus } from '@/adapter/toapisClient'
import { translateError } from '@/utils/errors'
import { MODELS, DEFAULT_MODEL, DEFAULT_RESOLUTION, DEFAULT_ASPECT_RATIO, getAspectRatios, getPrice, formatCredits } from '@/types/adapter'
import type { ModelId } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'

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
const selectedModelId = ref<ModelId>(DEFAULT_MODEL)
const resolution = ref(DEFAULT_RESOLUTION)
const aspectRatio = ref(DEFAULT_ASPECT_RATIO)

const selectedModel = computed(() => MODELS.find(m => m.id === selectedModelId.value))
const availableResolutions = computed(() => selectedModel.value?.resolutions || ['1K'])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return getAspectRatios(selectedModel.value, resolution.value)
})
const unitPrice = computed(() => {
  if (!selectedModel.value) return 0
  return getPrice(selectedModel.value, resolution.value)
})

function handleModelChange() {
  const model = selectedModel.value
  if (model) {
    if (!model.resolutions.includes(resolution.value)) {
      resolution.value = model.resolutions[0]
    }
    aspectRatio.value = getAspectRatios(model, resolution.value)[0]
  }
}

function handleResolutionChange() {
  const model = selectedModel.value
  if (model) {
    const ratios = getAspectRatios(model, resolution.value)
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
    const costText = serverStatus.usingPersonalKey
      ? '使用个人 Key，不消耗积分'
      : `预计消耗：${formatCredits(total)}`
    await ElMessageBox.confirm(
      `选中任务：${count} 个\n${costText}`,
      '确认提交',
      {
        confirmButtonText: '确认提交',
        cancelButtonText: '取消',
        type: 'info',
      }
    )
  } catch { return }

  // Check balance（个人 Key 模式不消耗积分，跳过校验）
  if (!serverStatus.usingPersonalKey) {
    try {
      const res = await pointsApi.getMyBalance()
      const balance = res.data.data?.balance ?? 0
      if (balance < total) {
        warning(`积分不足，需要 ${formatCredits(total)}，当前余额 ${formatCredits(balance)}`)
        return
      }
    } catch { /* proceed */ }
  }

  // Filter to selected rows
  const toSubmit = tableData.value.filter(r => r.selected)
  step.value = 'generating'

  let submitted = 0

  for (let i = 0; i < toSubmit.length; i++) {
    const row = toSubmit[i]
    row.status = 'submitting'

    try {
      // 调用统一入口 submitTask
      const result = await submitTask({
        model: selectedModelId.value,
        prompt: row.prompt,
        size: aspectRatio.value,
        resolution: resolution.value,
        refImages: row.imageUrls.map(url => ({ url })),
      })

      row.taskId = result.dbTaskId
      row.toapisTaskId = result.toapisTaskId
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
  if (!row.toapisTaskId) return
  const timer = setInterval(async () => {
    try {
      // 单次查询：由 setInterval 定时器驱动
      const result = await getTaskStatus(row.toapisTaskId!)
      row.progress = result.progress

      if (result.status === 'completed') {
        const importedUrls = await importResultUrls(row.toapisTaskId!, result.resultUrls)
        row.status = 'completed'
        row.resultUrl = importedUrls[0]
        row.progress = 100
        if (row.taskId) {
          await taskApi.update(row.taskId, {
            status: 'completed', progress: 100,
            result_image_urls: importedUrls,
            completed_at: new Date().toISOString(),
            expires_at: result.expiresAt,
          })
        }
        clearInterval(timer)
      } else if (result.status === 'failed') {
        row.status = 'failed'
        row.errorMsg = result.errorMessage || '生成失败'
        if (row.taskId) {
          await taskApi.update(row.taskId, {
            status: 'failed', progress: result.progress,
            error_message: result.errorMessage,
            error_code: result.errorCode,
          })
        }
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
    // 调用统一入口 submitTask
    const result = await submitTask({
      model: selectedModelId.value,
      prompt: row.prompt,
      size: aspectRatio.value,
      resolution: resolution.value,
      refImages: row.imageUrls.map(url => ({ url })),
    })

    row.taskId = result.dbTaskId
    row.toapisTaskId = result.toapisTaskId
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
      <div class="page-header-row">
        <el-button :icon="ArrowLeft" text @click="goBack">返回</el-button>
        <h2>批量传表格做图</h2>
      </div>
    </template>

    <!-- Step 1: Upload -->
    <div v-if="step === 'upload'" class="step-upload">
      <el-alert
        v-if="serverStatus.loaded && !serverStatus.canGenerate"
        title="未配置可用的 API Key（共享/个人均未配置），生图功能暂不可用"
        type="warning" show-icon :closable="false" style="margin-bottom: 16px"
      />

      <div class="upload-actions">
        <el-button :icon="Download" @click="downloadTemplate">下载模板</el-button>
        <el-button type="primary" :icon="Document" @click="fileInputRef?.click()">上传表格</el-button>
        <input ref="fileInputRef" type="file" accept=".xlsx,.xls" hidden @change="handleFileUpload" />
      </div>
      <p class="upload-hint">请先下载模板，填写后上传。表格需包含：文件名(可选)、提示词(必填)、图片链接(必填)</p>
    </div>

    <!-- Step 2: Preview -->
    <div v-if="step === 'preview'" class="step-preview">
      <!-- Table -->
      <div class="preview-table-wrap">
        <el-table :data="tableData" border size="small" max-height="400" @selection-change="(rows: TableRow[]) => { tableData.forEach(r => r.selected = rows.includes(r)) }">
          <el-table-column type="selection" width="45" />
          <el-table-column prop="filename" label="文件名" width="140" show-overflow-tooltip />
          <el-table-column prop="prompt" label="提示词" min-width="200" show-overflow-tooltip />
          <el-table-column label="图片链接" min-width="240">
            <template #default="{ row }">
              <div v-for="(url, i) in row.imageUrls" :key="i" class="url-cell">
                <img v-if="url" :src="url" class="url-thumb" @error="($event.target as HTMLImageElement).style.display='none'" />
                <span class="url-text">{{ truncateUrl(url) }}</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="preview-summary">共 {{ tableData.length }} 条，已选 {{ selectedCount }} 条</div>

      <!-- Params -->
      <div class="params-section">
        <div class="param-row">
          <label class="param-label">模型</label>
          <el-select v-model="selectedModelId" style="width: 200px" @change="handleModelChange">
            <el-option v-for="m in MODELS" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </div>
        <div class="param-row">
          <label class="param-label">分辨率</label>
          <el-radio-group v-model="resolution" @change="handleResolutionChange">
            <el-radio-button v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="param-row">
          <label class="param-label">宽高比</label>
          <el-select v-model="aspectRatio" style="width: 200px">
            <el-option v-for="ar in availableAspectRatios" :key="ar" :label="ar" :value="ar" />
          </el-select>
        </div>
      </div>

      <!-- Footer -->
      <div class="preview-footer">
        <el-button @click="step = 'upload'">重新上传</el-button>
        <el-button type="primary" :disabled="selectedCount === 0" @click="handleGenerate">
          开始生成 · {{ selectedCount }} 个任务 · {{ serverStatus.usingPersonalKey ? '个人 Key · 不消耗积分' : formatCredits(unitPrice * selectedCount) }}
        </el-button>
      </div>
    </div>

    <!-- Step 3: Generating -->
    <div v-if="step === 'generating'" class="step-generating">
      <!-- Progress -->
      <div class="gen-progress">
        <el-progress
          :percentage="progressPercent"
          :stroke-width="20"
          :text-inside="true"
          status="success"
        />
        <span class="gen-progress-text">{{ completedCount }} / {{ tableData.length }}</span>
      </div>

      <!-- Table with status -->
      <div class="gen-table-wrap">
        <el-table :data="tableData" border size="small" max-height="500">
          <el-table-column type="selection" width="45" :selectable="() => true" />
          <el-table-column prop="filename" label="文件名" width="140" show-overflow-tooltip />
          <el-table-column prop="prompt" label="提示词" min-width="180" show-overflow-tooltip />
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'pending'" type="info" size="small">等待中</el-tag>
              <el-tag v-else-if="row.status === 'submitting'" type="warning" size="small">提交中</el-tag>
              <el-tag v-else-if="row.status === 'in_progress'" type="primary" size="small">生成中 {{ row.progress }}%</el-tag>
              <el-tag v-else-if="row.status === 'completed'" type="success" size="small">成功</el-tag>
              <el-tag v-else-if="row.status === 'failed'" type="danger" size="small" :title="row.errorMsg">失败</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="结果" width="100">
            <template #default="{ row }">
              <img v-if="row.resultUrl" :src="row.resultUrl" class="result-thumb" />
              <el-button v-else-if="row.status === 'failed'" size="small" type="danger" text :icon="Refresh" @click="retryRow(row)">重试</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- Download actions -->
      <div v-if="allDone" class="gen-actions">
        <el-button type="primary" :icon="Download" :disabled="downloadableRows.length === 0" @click="downloadDirect">直接下载</el-button>
        <el-button :icon="Download" :disabled="downloadableRows.length === 0" @click="downloadZip">打包下载</el-button>
        <el-button v-if="failedRows.length > 0" type="warning" :icon="Refresh" @click="retryFailed">重试失败项</el-button>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.page-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-header-row h2 { margin: 0; }

/* Step 1 */
.step-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 80px;
  gap: 20px;
}
.upload-actions {
  display: flex;
  gap: 12px;
}
.upload-hint {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}

/* Step 2 */
.step-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}
.preview-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.preview-summary {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}
.params-section {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.param-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  white-space: nowrap;
}
.preview-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}

/* Step 3 */
.step-generating {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}
.gen-progress {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gen-progress :deep(.el-progress) {
  flex: 1;
}
.gen-progress-text {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.gen-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.gen-actions {
  display: flex;
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}

/* Shared */
.url-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.url-thumb {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
}
.url-text {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.result-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
}
</style>
