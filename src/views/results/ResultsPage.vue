<script setup lang="ts">
/**
 * ResultsPage - 生图结果
 *
 * 信息层级：缩略图（主角）> 提示词（找回“是哪一张”的钥匙）> 参数与日期（辅助）。
 * 高频动作（预览 / 下载）就近放在图块上，低频与危险动作（打包、删除）收进下拉。
 * 批量模式不再改写页头，而是在内容滚动区顶部钉一条选择栏。
 */
defineOptions({ name: 'ResultsPage' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { useImagePreview } from '@/composables/useImagePreview'
import { Download, Trash2, Image as ImageIcon, Check, X, Ellipsis, RefreshCw, TriangleAlert, Eye } from '@lucide/vue'
import PageLayout from '@/components/PageLayout.vue'
import { UiEmptyState, UiImagePreview, UiPagination } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { taskApi } from '@/services/taskApi'
import { downloadUrl } from '@/utils/download'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import { cn } from '@/lib/utils'
import { toBJDate } from '@/utils/datetime'
import type { TaskItem } from '@/components/TaskList.vue'

const { success, info, warning, error, confirmDanger } = useUiFeedback()
const { retryOnError } = useImageRetry()

const tasks = ref<TaskItem[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(24)
const total = ref(0)

// 仅 UI：请求失败时把原因显性化（原来只 console.error，页面看起来像“空的”）
const loadFailed = ref(false)

// Bulk mode
const bulkMode = ref(false)
const selectedIds = ref(new Set<number>())

// 仅 UI：feature_id → 功能名角标
function featureLabel(id?: string) {
  if (!id) return ''
  return FEATURE_CONFIGS[id]?.label || id
}

async function loadResults() {
  loading.value = true
  try {
    const res = await taskApi.list({ page: page.value, pageSize: pageSize.value, status: 'completed' })
    tasks.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
    loadFailed.value = false
  } catch (e) {
    console.error('Load results error:', e)
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value
  if (!bulkMode.value) selectedIds.value.clear()
}

function toggleSelect(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function selectAll() {
  if (selectedIds.value.size === tasks.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(tasks.value.map((t) => t.id))
  }
}

// 仅 UI：全选按钮的文案与状态
const allSelected = computed(
  () => tasks.value.length > 0 && selectedIds.value.size === tasks.value.length,
)
const hasImageCount = computed(
  () => tasks.value.filter((t) => selectedIds.value.has(t.id) && t.result_image_urls?.[0]).length,
)
// 仅 UI：工具栏里的页码概览
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / (pageSize.value || 1))))

// ─── Download helpers ───

async function handleDownload(task: TaskItem) {
  const url = task.result_image_urls?.[0]
  if (!url) { warning('没有可下载的图片'); return }
  try {
    await downloadUrl(url, task.task_no || task.toapis_task_id || `任务${task.id}`)
    success('下载完成')
  } catch {
    error('下载失败')
  }
}

async function handleDelete(task: TaskItem) {
  try {
    await taskApi.delete(task.id)
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    total.value--
    success('已删除')
  } catch { /* cancelled */ }
}

// ─── Batch operations ───

async function handleBatchDelete() {
  const count = selectedIds.value.size
  try {
    await confirmDanger({
      title: '批量删除',
      message: `确定要删除选中的 ${count} 项结果吗？此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    })
  } catch { return }

  loading.value = true
  let deleted = 0
  for (const id of selectedIds.value) {
    try { await taskApi.delete(id); deleted++ } catch { /* skip */ }
  }
  selectedIds.value.clear()
  bulkMode.value = false
  await loadResults()
  loading.value = false
  success(`已删除 ${deleted} 项`)
}

async function handleBatchDownload() {
  const selected = tasks.value.filter((t) => selectedIds.value.has(t.id) && t.result_image_urls?.[0])
  if (selected.length === 0) { warning('所选结果没有可下载的图片'); return }

  loading.value = true
  let count = 0
  for (const task of selected) {
    try {
      await downloadUrl(task.result_image_urls[0], task.task_no || task.toapis_task_id || `任务${task.id}`)
      count++
      // Small delay between downloads to avoid browser throttling
      await new Promise((r) => setTimeout(r, 300))
    } catch { /* skip */ }
  }
  loading.value = false
  success(`已下载 ${count} 张图片`)
}

// 与 handleBatchDownload 行为一致（业务层未差异化），仅收进「更多」菜单
async function handlePackDownload() {
  await handleBatchDownload()
}

// ─── Preview ───

const { visible: previewVisible, url: previewUrl, open: openPreviewRaw } = useImagePreview()
function openPreview(url: string) { if (!bulkMode.value) openPreviewRaw(url) }

// ─── Pagination ───

function handlePageChange(p: number) { page.value = p; loadResults() }
function handlePageSizeChange(s: number) { pageSize.value = s; page.value = 1; loadResults() }

onMounted(() => { loadResults() })
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>生图结果</h2>
      <p class="text-muted-foreground mt-1 max-w-3xl text-[13px] leading-normal">
        已完成任务的成图清单。点击缩略图看大图，支持逐张下载或批量清理。
      </p>
    </template>
    <template #extra>
      <Button v-if="!bulkMode" variant="outline" size="sm" class="gap-1.5" @click="toggleBulkMode">
        <Check class="size-3.5" />批量选择
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="刷新"
        aria-label="刷新列表"
        :disabled="loading"
        @click="loadResults"
      >
        <RefreshCw class="size-4" :class="cn('transition-transform', loading && 'animate-spin')" />
      </Button>
    </template>

    <!-- 常驻工具栏：列表概览 +（批量模式下）选择态与批量动作，贴在滚动区顶部 -->
    <div
      class="bg-background sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2"
    >
      <span class="text-[13px] font-medium tabular-nums">共 {{ total }} 张</span>
      <span aria-hidden="true" class="text-muted-foreground/50 text-[12px]">·</span>
      <span class="text-muted-foreground text-[12px] tabular-nums">
        第 {{ page }} / {{ pageCount }} 页，每页 {{ pageSize }} 张
      </span>

      <template v-if="bulkMode">
        <Separator orientation="vertical" class="h-4" />
        <span class="text-[13px] font-medium tabular-nums">已选 {{ selectedIds.size }} 项</span>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground cursor-pointer text-[12px] underline decoration-border underline-offset-4 transition-colors"
          @click="selectAll"
        >
          {{ allSelected ? '取消全选本页' : '全选本页' }}
        </button>
        <span v-if="selectedIds.size" class="text-muted-foreground text-[12px] tabular-nums">
          {{ hasImageCount }} 张可下载
        </span>

        <div class="ml-auto flex items-center gap-2">
          <Button size="sm" :disabled="selectedIds.size === 0" @click="handleBatchDownload">
            <Download />批量下载
          </Button>
          <Button
            size="sm"
            variant="destructive"
            :disabled="selectedIds.size === 0"
            @click="handleBatchDelete"
          >
            <Trash2 />删除
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="icon-sm" aria-label="更多批量操作">
                <Ellipsis class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem :disabled="selectedIds.size === 0" @click="handlePackDownload">
                <Download />打包下载
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="toggleBulkMode">
                <X />退出批量操作
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </template>
    </div>

    <!-- 加载失败 -->
    <div
      v-if="loadFailed && !loading && tasks.length === 0"
      class="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center"
    >
      <TriangleAlert class="text-destructive size-6" :stroke-width="1.5" />
      <p class="text-[13px] font-medium">生图结果加载失败</p>
      <p class="text-muted-foreground max-w-sm text-xs leading-5">
        网络或服务暂时不可用，已有数据未受影响，重试即可。
      </p>
      <Button size="sm" variant="outline" class="mt-1 gap-1.5" @click="loadResults">
        <RefreshCw class="size-3.5" />重试
      </Button>
    </div>

    <!-- 图集：图块本身即数据表面，只留 1px 描边不做卡片堆叠 -->
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
      <template v-if="loading && tasks.length === 0">
        <div v-for="i in 12" :key="`sk-${i}`" class="overflow-hidden rounded-lg border">
          <Skeleton class="aspect-square w-full rounded-none" />
          <div class="flex flex-col gap-1.5 p-2.5">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      </template>

      <template v-else-if="tasks.length === 0">
        <div class="col-span-full">
          <UiEmptyState
            title="还没有成功的生成结果"
            description="去工作台发起一次生成，完成后会自动出现在这里。"
          />
        </div>
      </template>

      <template v-else>
        <article
          v-for="task in tasks"
          :key="task.id"
          class="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-[border-color,box-shadow] hover:border-input"
          :class="cn(bulkMode && selectedIds.has(task.id) && 'border-primary ring-1 ring-primary/45')"
          @click="bulkMode && toggleSelect(task.id)"
        >
          <!-- 缩略图 + 悬停操作层 -->
          <div
            class="relative aspect-square overflow-hidden bg-muted"
            :class="cn(bulkMode ? 'cursor-pointer' : 'cursor-zoom-in')"
            @click="!bulkMode && task.result_image_urls?.[0] && openPreview(task.result_image_urls[0])"
          >
            <img
              v-if="task.result_image_urls?.[0]"
              :src="task.result_image_urls[0]"
              :alt="task.prompt || '生成结果'"
              loading="lazy"
              class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
              @error="retryOnError($event, task.result_image_urls[0])"
            />
            <ImageIcon v-else class="text-muted-foreground/50 size-8" />

            <Badge
              v-if="featureLabel(task.feature_id)"
              variant="secondary"
              class="absolute top-1.5 left-1.5 h-5 border border-border/60 bg-background/90 text-[11px] font-normal"
            >
              {{ featureLabel(task.feature_id) }}
            </Badge>

            <!-- 批量勾选 -->
            <button
              v-if="bulkMode"
              type="button"
              :aria-label="selectedIds.has(task.id) ? '取消选择' : '选择此项'"
              :aria-pressed="selectedIds.has(task.id)"
              class="absolute right-1.5 bottom-1.5 z-20 flex size-6 cursor-pointer items-center justify-center rounded-md border transition-colors"
              :class="cn(
                selectedIds.has(task.id)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-background/80 bg-foreground/35 text-transparent hover:bg-foreground/55',
              )"
              @click.stop="toggleSelect(task.id)"
            >
              <Check class="size-3.5" />
            </button>

            <!-- 悬停/键盘聚焦时才出现的操作层 -->
            <div
              v-if="!bulkMode"
              class="absolute right-1.5 bottom-1.5 z-20 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <Button
                v-if="task.result_image_urls?.[0]"
                variant="secondary"
                size="icon-sm"
                title="看大图"
                aria-label="看大图"
                class="shadow-sm"
                @click.stop="openPreview(task.result_image_urls[0])"
              >
                <Eye class="size-3.5" />
              </Button>
              <Button
                v-if="task.result_image_urls?.[0]"
                variant="secondary"
                size="icon-sm"
                title="下载"
                aria-label="下载"
                class="shadow-sm"
                @click.stop="handleDownload(task)"
              >
                <Download class="size-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    title="更多操作"
                    aria-label="更多操作"
                    class="shadow-sm"
                    @click.stop
                  >
                    <Ellipsis class="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-44">
                  <DropdownMenuItem
                    v-if="task.result_image_urls?.[0]"
                    @click="handleDownload(task)"
                  >
                    <Download />下载原图
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="handleDelete(task)" class="text-destructive">
                    <Trash2 />删除结果
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <!-- 文字层：提示词优先，参数与日期压成一行 -->
          <div class="min-w-0 flex-1 px-2.5 py-2">
            <p
              class="line-clamp-2 text-[13px] leading-5 break-words"
              :title="task.prompt"
            >
              {{ task.prompt || '（无提示词）' }}
            </p>
            <p class="text-muted-foreground mt-1 flex min-w-0 items-center gap-1.5 text-[11px] tabular-nums">
              <span class="truncate">{{ task.model }}</span>
              <span aria-hidden="true">·</span>
              <span class="shrink-0">{{ task.resolution || '—' }} {{ task.aspectRatio || '' }}</span>
              <span aria-hidden="true">·</span>
              <span class="shrink-0">{{ toBJDate(task.created_at) }}</span>
            </p>
          </div>
          </article>
      </template>

      <!-- 翻页时的行内加载提示 -->
      <div
        v-if="loading && tasks.length > 0"
        class="col-span-full flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"
      >
        <RefreshCw class="size-3.5 animate-spin" />加载中…
      </div>
    </div>

    <template #footer>
      <UiPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[24, 48, 96]"
        :total="total"
        :disabled="loading"
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </template>
  </PageLayout>

  <!-- Preview -->
  <UiImagePreview v-model="previewVisible" :url="previewUrl" />
</template>
