<script setup lang="ts">
/**
 * BuyerShowHistoryPanel — AI 买家秀 · 任务历史（Tab 3）。
 *
 * 按批次（batch_id = 一个任务）聚合的只读回看视图：
 * - 列表：每个已归档任务 → 名称 / 时间 / 完成度 / 操作（查看 · 下载 zip · 改名 · 删除）。
 * - 详情：该任务全部行（主图、商品ID、提示词、状态、结果），结果点击弹对比弹窗。
 *
 * 数据同源于制作买家秀工作区（buyer_show_batch_items 左联 generation_tasks），
 * 仅按 batch_id 聚合呈现；不做重新生成。
 */
import { ref, computed, onMounted } from 'vue'
import { ArrowLeft, Download, Image, LoaderCircle, Pencil, Trash2 } from '@lucide/vue'
import { toBJDate } from '@/utils/datetime'

import { useUiFeedback, promptDialog } from '@/composables/useUiFeedback'
import { buyerShowBatchApi } from '@/services/buyerShowBatchApi'
import type { BatchItemRow, BuyerShowBatch } from '@/services/buyerShowBatchApi'
import { UiEmptyState, UiImagePreview, UiPagination } from '@/components/ui'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import type { TaskItem } from '@/components/TaskList.vue'
import { downloadRowsAsZip, rowToTaskItem } from '@/utils/buyerShowZip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

defineOptions({ name: 'BuyerShowHistoryPanel' })

const { success, warning, error, confirmDanger } = useUiFeedback()

// ─── Types ───

type RowStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

interface HistoryRow {
  id: number
  productId: string
  mainImageUrl: string
  prompt: string
  status: RowStatus
  progress: number
  taskId: number | null
  toapisTaskId: string | null
  resultUrl?: string
  resultImageUrls?: string[]
  inputImageUrls?: string[]
  errorMsg?: string
  model?: string
  resolution?: string
  aspectRatio?: string
}

// ─── State ───

const batches = ref<BuyerShowBatch[]>([])
const loading = ref(false)

const view = ref<'list' | 'detail'>('list')
const selectedBatch = ref<BuyerShowBatch | null>(null)
const items = ref<HistoryRow[]>([])
const itemsLoading = ref(false)

// 列表分页（前端分页）
const currentPage = ref(1)
const pageSize = ref(10)
const pagedBatches = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return batches.value.slice(start, start + pageSize.value)
})

const zipping = ref(false)
const zippingBatchId = ref<string | null>(null)

// 对比弹窗
const compareVisible = ref(false)
const compareInitialIndex = ref(0)
const compareTaskId = ref<number | undefined>(undefined)

// 主图大图预览
const previewVisible = ref(false)
const previewUrl = ref('')

// ─── Helpers ───

function normalizeStatus(s: string): RowStatus {
  if (s === 'completed') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'pending') return 'pending'
  return 'in_progress'
}

function batchDisplayName(b: BuyerShowBatch): string {
  return b.name || `${toBJDate(b.createdAt)} · ${b.itemCount} 个商品`
}

function completionPct(b: BuyerShowBatch): number {
  if (b.itemCount === 0) return 0
  return Math.round((b.completedCount / b.itemCount) * 100)
}

function rowFromRecord(r: BatchItemRow): HistoryRow {
  const urls = r.resultImageUrls || []
  return {
    id: r.id,
    productId: r.productId,
    mainImageUrl: r.mainImageUrl,
    prompt: r.prompt,
    status: normalizeStatus(r.status),
    progress: r.progress,
    taskId: r.taskId,
    toapisTaskId: r.toapisTaskId,
    resultUrl: urls[0],
    resultImageUrls: urls,
    inputImageUrls: r.inputImageUrls,
    errorMsg: r.errorMessage || undefined,
    model: r.model,
    resolution: r.resolution,
    aspectRatio: r.aspectRatio,
  }
}

// ─── List ───

async function loadBatches() {
  loading.value = true
  try {
    const res = await buyerShowBatchApi.listBatches()
    batches.value = res.data.data.records || []
    // 当前页越界时回到第 1 页
    const maxPage = Math.max(1, Math.ceil(batches.value.length / pageSize.value))
    if (currentPage.value > maxPage) currentPage.value = maxPage
  } catch {
    error('加载任务历史失败')
  } finally {
    loading.value = false
  }
}

// ─── Detail ───

async function openDetail(b: BuyerShowBatch) {
  selectedBatch.value = b
  view.value = 'detail'
  await loadItems(b.batchId)
}

async function loadItems(batchId: string) {
  itemsLoading.value = true
  try {
    const res = await buyerShowBatchApi.getBatchItems(batchId)
    const records: BatchItemRow[] = res.data.data.records
    items.value = records.map(rowFromRecord)
  } catch {
    error('加载任务详情失败')
  } finally {
    itemsLoading.value = false
  }
}

function backToList() {
  view.value = 'list'
  selectedBatch.value = null
  items.value = []
  loadBatches()
}

// ─── Rename ───

async function renameBatch(b: BuyerShowBatch) {
  try {
    const p = await promptDialog('请输入任务名称（留空则用「时间 · N个商品」默认名）', '任务改名', {
      confirmText: '保存',
      cancelText: '取消',
      inputValue: b.name,
      inputPlaceholder: '例如：618女装第一批',
    })
    const name = (p.value || '').trim()
    await buyerShowBatchApi.updateBatch(b.batchId, { name })
    b.name = name
    success('已改名')
  } catch { /* cancelled */ }
}

// ─── Delete ───

async function deleteBatch(b: BuyerShowBatch) {
  try {
    await confirmDanger({
      title: '删除任务',
      message: `确定删除任务「${batchDisplayName(b)}」吗？将同时删除其全部 ${b.itemCount} 条记录，且无法恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    })
  } catch { return }
  try {
    await buyerShowBatchApi.deleteBatch(b.batchId)
    success('已删除')
    if (selectedBatch.value?.batchId === b.batchId) {
      backToList()
    } else {
      await loadBatches()
    }
  } catch (err) {
    error(err, '删除失败')
  }
}

// ─── Zip download ───

async function downloadBatchZip(b: BuyerShowBatch) {
  zippingBatchId.value = b.batchId
  try {
    const res = await buyerShowBatchApi.getBatchItems(b.batchId)
    const records: BatchItemRow[] = res.data.data.records
    const rows = records
      .filter(r => normalizeStatus(r.status) === 'completed')
      .map(r => ({ id: r.id, productId: r.productId, resultUrl: (r.resultImageUrls || [])[0] }))
    if (rows.length === 0) {
      warning('该任务没有可下载的结果')
      return
    }
    const ok = await downloadRowsAsZip(rows, batchDisplayName(b))
    if (ok === 0) {
      error('下载失败，结果可能尚未转存完成')
      return
    }
    success(`已打包 ${ok} 张图片`)
  } catch (err) {
    error(err, '打包下载失败')
  } finally {
    zippingBatchId.value = null
  }
}

async function downloadDetailZip() {
  if (!selectedBatch.value) return
  const rows = items.value
    .filter(r => r.status === 'completed' && r.resultUrl)
    .map(r => ({ id: r.id, productId: r.productId, resultUrl: r.resultUrl! }))
  if (rows.length === 0) {
    warning('该任务没有可下载的结果')
    return
  }
  zipping.value = true
  try {
    const ok = await downloadRowsAsZip(rows, batchDisplayName(selectedBatch.value))
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

// ─── Compare dialog ───

const compareTasks = computed<TaskItem[]>(() =>
  items.value
    .filter(r => r.taskId && r.status === 'completed')
    .map(r => rowToTaskItem(r, { model: '', resolution: '', aspectRatio: '9:16' }))
    .filter((t): t is TaskItem => !!t)
)

function openCompare(row: HistoryRow) {
  const idx = compareTasks.value.findIndex(t => t.id === row.taskId)
  compareInitialIndex.value = idx >= 0 ? idx : 0
  compareTaskId.value = row.taskId || undefined
  compareVisible.value = true
}

function openPreview(row: HistoryRow) {
  previewUrl.value = row.mainImageUrl
  previewVisible.value = true
}

// ─── Lifecycle ───

onMounted(() => {
  loadBatches()
})
</script>

<template>
  <div class="bsh-panel">
    <!-- 列表视图 -->
    <template v-if="view === 'list'">
      <div v-if="batches.length === 0 && !loading" class="bsh-empty">
        <UiEmptyState
          title="还没有历史任务"
          description="在「制作买家秀」上传表格生成并归档后，任务会出现在这里，可随时回看与下载。"
        />
      </div>

      <template v-else>
        <div class="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="min-w-[240px]">任务名称</TableHead>
                <TableHead class="w-[170px]">创建时间</TableHead>
                <TableHead class="w-[180px]">完成度</TableHead>
                <TableHead class="w-[100px]">状态</TableHead>
                <TableHead class="w-[240px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="loading">
                <TableRow v-for="i in 3" :key="i">
                  <TableCell colspan="5"><Skeleton class="h-8 w-full" /></TableCell>
                </TableRow>
              </template>
              <TableRow v-else v-for="row in pagedBatches" :key="row.batchId">
                <TableCell>
                  <div class="text-foreground font-medium">{{ batchDisplayName(row) }}</div>
                </TableCell>
                <TableCell>
                  <span class="text-muted-foreground text-sm">{{ toBJDate(row.createdAt) }}</span>
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-2">
                    <Progress
                      :model-value="completionPct(row)"
                      class="h-2 min-w-20 flex-1"
                      :class="row.completedCount === row.itemCount && row.itemCount > 0 ? '[&_[data-slot=progress-indicator]]:bg-success' : ''"
                    />
                    <span class="text-muted-foreground text-sm whitespace-nowrap">{{ row.completedCount }}/{{ row.itemCount }}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge v-if="row.failedCount > 0" variant="destructive">{{ row.failedCount }} 失败</Badge>
                  <Badge v-else-if="row.completedCount === row.itemCount && row.itemCount > 0" variant="success">全部完成</Badge>
                  <Badge v-else variant="secondary">部分完成</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" @click="openDetail(row)"><Image />查看详情</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    :disabled="zippingBatchId === row.batchId || row.completedCount === 0"
                    @click="downloadBatchZip(row)"
                  >
                    <LoaderCircle v-if="zippingBatchId === row.batchId" class="animate-spin" /><Download v-else />下载
                  </Button>
                  <Button variant="ghost" size="sm" @click="renameBatch(row)"><Pencil />改名</Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="text-destructive hover:text-destructive"
                    @click="deleteBatch(row)"
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <UiPagination
          :current-page="currentPage"
          :page-size="pageSize"
          :total="batches.length"
          @update:current-page="currentPage = $event"
          @update:page-size="(v: number) => { pageSize = v; currentPage = 1 }"
        />
      </template>
    </template>

    <!-- 详情视图 -->
    <template v-else>
      <div class="bsh-detail-header">
        <Button variant="ghost" @click="backToList"><ArrowLeft />返回列表</Button>
        <div class="bsh-detail-title">
          <span class="bsh-detail-name">{{ selectedBatch ? batchDisplayName(selectedBatch) : '' }}</span>
          <span v-if="selectedBatch" class="bsh-detail-meta">
            {{ toBJDate(selectedBatch.createdAt) }} ·
            完成 {{ selectedBatch.completedCount }}/{{ selectedBatch.itemCount }}
            <template v-if="selectedBatch.failedCount > 0"> · {{ selectedBatch.failedCount }} 失败</template>
          </span>
        </div>
        <div class="bsh-detail-actions">
          <Button
            :disabled="zipping || items.filter(r => r.status === 'completed' && r.resultUrl).length === 0"
            @click="downloadDetailZip"
          >
            <LoaderCircle v-if="zipping" class="animate-spin" /><Download v-else />下载全部结果
          </Button>
          <Button v-if="selectedBatch" variant="outline" @click="renameBatch(selectedBatch)"><Pencil />改名</Button>
          <Button v-if="selectedBatch" variant="destructive" @click="deleteBatch(selectedBatch)"><Trash2 />删除任务</Button>
        </div>
      </div>

      <div class="bsh-detail-table">
        <div class="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[84px]">主图</TableHead>
                <TableHead class="w-[160px]">商品ID</TableHead>
                <TableHead class="min-w-[260px]">提示词</TableHead>
                <TableHead class="w-[120px]">状态</TableHead>
                <TableHead class="w-[96px]">结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="itemsLoading">
                <TableRow v-for="i in 3" :key="i">
                  <TableCell colspan="5"><Skeleton class="h-8 w-full" /></TableCell>
                </TableRow>
              </template>
              <TableRow v-else v-for="row in items" :key="row.id">
                <TableCell>
                  <img
                    v-if="row.mainImageUrl" :src="row.mainImageUrl" class="thumb"
                    @error="($event.target as HTMLImageElement).style.opacity = '0.3'"
                    @click="openPreview(row)"
                  />
                </TableCell>
                <TableCell class="max-w-40 truncate" :title="row.productId">{{ row.productId }}</TableCell>
                <TableCell>
                  <Textarea v-model="row.prompt" readonly class="min-h-9 text-sm" />
                </TableCell>
                <TableCell>
                  <Badge v-if="row.status === 'completed'" variant="success">成功</Badge>
                  <Badge v-else-if="row.status === 'in_progress'" variant="warning">生成中 {{ row.progress }}%</Badge>
                  <Badge v-else-if="row.status === 'failed'" variant="destructive" :title="row.errorMsg">失败</Badge>
                  <Badge v-else variant="secondary">待生成</Badge>
                </TableCell>
                <TableCell>
                  <img
                    v-if="row.resultUrl" :src="row.resultUrl" class="thumb result-thumb"
                    @click="openCompare(row)"
                  />
                  <span v-else-if="row.status === 'failed'" class="bsh-err" :title="row.errorMsg">生成失败</span>
                  <span v-else class="bsh-muted">—</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </template>

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
    <ImageCompareDialog
      v-model="compareVisible" :tasks="compareTasks"
      :initial-index="compareInitialIndex" :task-id="compareTaskId"
    />
  </div>
</template>

<style scoped>
.bsh-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 列表空态 */
.bsh-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 48px;
}

/* 详情头 */
.bsh-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--momo-color-bg-muted);
  border-radius: var(--momo-radius-md);
  flex-wrap: wrap;
}
.bsh-detail-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 200px;
}
.bsh-detail-name {
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  color: var(--momo-color-text);
}
.bsh-detail-meta {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
}
.bsh-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 详情表格 */
.bsh-detail-table {
  min-height: 0;
}
.thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--momo-radius-sm);
  border: 1px solid var(--momo-color-border);
  cursor: zoom-in;
}
.result-thumb {
  cursor: zoom-in;
}
.bsh-err {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-danger);
}
.bsh-muted {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-placeholder);
}
</style>
