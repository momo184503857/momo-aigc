<script setup lang="ts">
import DsThumbnail from '@/components/design-system/composites/DsThumbnail.vue'
import { ref } from 'vue'
import { CircleAlert, Copy, Download, LoaderCircle } from '@lucide/vue'
import type { TaskItem } from './TaskList.vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { getFeatureLabel } from '@/configs/featureConfig'
import { useClipboard } from '@/composables/useClipboard'
import { downloadUrl } from '@/utils/download'
import { Button } from '@/components/design-system/primitives/button'
import { Badge } from '@/components/design-system/primitives/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/design-system/primitives/dialog'
const { copy } = useClipboard()

const modelCatalog = useModelCatalogStore()

const props = defineProps<{ task: TaskItem | null; loadTask?: (task: TaskItem) => Promise<TaskItem> }>()
const emit = defineEmits<{ close: []; loaded: [task: TaskItem] }>()

const visible = ref(false)
const displayTask = ref<TaskItem | null>(null)
const detailLoading = ref(false)
const detailError = ref(false)

async function reload() {
  if (!props.task || !props.loadTask) return
  detailLoading.value = true
  detailError.value = false
  try {
    displayTask.value = await props.loadTask(props.task)
    emit('loaded', displayTask.value)
  } catch {
    detailError.value = true
  } finally {
    detailLoading.value = false
  }
}

function open() {
  displayTask.value = props.task
  visible.value = true
  void reload()
}
function close() { visible.value = false; emit('close') }

defineExpose({ open, close })

function modelDisplayName(modelId: string): string {
  return modelCatalog.displayNameFor(modelId)
}

function openImage(url: string) {
  window.open(url, '_blank')
}

async function handleDownload(url: string) {
  await downloadUrl(url, 'result.png')
}

const statusMap: Record<string, string> = {
  submitted: '已提交', queued: '排队中', in_progress: '生成中',
  importing: '下载中', completed: '已完成', failed: '生成失败', unknown: '状态未知',
}

function statusVariant(status: string): 'success' | 'destructive' | 'secondary' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'destructive'
  return 'secondary'
}
</script>

<template>
  <Dialog :open="visible" @update:open="(v: boolean) => { if (!v) close() }">
    <DialogContent class="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>任务详情</DialogTitle>
      </DialogHeader>

      <div v-if="displayTask" class="max-h-[70vh] overflow-y-auto">
        <div v-if="detailLoading" class="text-muted-foreground mb-3 flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <LoaderCircle class="size-4 animate-spin" />正在加载完整任务详情…
        </div>
        <div v-else-if="detailError" class="border-destructive/40 text-destructive mb-3 flex items-center gap-2 rounded-md border p-3 text-sm" role="alert">
          <CircleAlert class="size-4 shrink-0" />任务详情加载失败
          <Button class="ml-auto" size="sm" variant="outline" @click="reload">重试</Button>
        </div>
        <dl class="grid grid-cols-2 overflow-hidden rounded-lg border text-sm">
          <div class="detail-cell">
            <dt>任务ID</dt>
            <dd class="flex items-center gap-1">
              <span class="font-mono break-all">{{ displayTask.task_no || '-' }}</span>
              <Button v-if="displayTask.task_no" variant="ghost" size="icon-xs" title="复制任务ID" @click="copy(displayTask.task_no || '')">
                <Copy />
              </Button>
            </dd>
          </div>
          <div class="detail-cell">
            <dt>状态</dt>
            <dd>
              <Badge :variant="statusVariant(displayTask.status)">{{ statusMap[displayTask.status] || displayTask.status }}</Badge>
            </dd>
          </div>
          <div class="detail-cell">
            <dt>功能</dt>
            <dd>{{ displayTask.feature_id ? getFeatureLabel(displayTask.feature_id) : '-' }}</dd>
          </div>
          <div class="detail-cell">
            <dt>模型</dt>
            <dd>{{ modelDisplayName(displayTask.model) }}</dd>
          </div>
          <div class="detail-cell">
            <dt>分辨率</dt>
            <dd>{{ displayTask.resolution }}</dd>
          </div>
          <div class="detail-cell">
            <dt>宽高比</dt>
            <dd>{{ displayTask.aspectRatio }}</dd>
          </div>
          <div class="detail-cell">
            <dt>进度</dt>
            <dd>{{ displayTask.progress }}%</dd>
          </div>
          <div class="detail-cell">
            <dt>提交时间</dt>
            <dd>{{ displayTask.created_at }}</dd>
          </div>
          <div class="detail-cell">
            <dt>完成时间</dt>
            <dd>{{ displayTask.completed_at || '-' }}</dd>
          </div>
          <!-- 自由生图：直接显示完整提示词 -->
          <div v-if="!displayTask.feature_id || displayTask.feature_id === 'free-gen'" class="detail-cell col-span-2">
            <dt>提示词</dt>
            <dd class="prompt-block">{{ displayTask.prompt }}</dd>
          </div>

          <!-- 功能/AI摄影：拆分为补充提示词 + 最终提示词 -->
          <template v-else>
            <div class="detail-cell col-span-2">
              <dt>补充提示词</dt>
              <dd class="prompt-block">{{ displayTask.user_prompt || '-' }}</dd>
            </div>
            <div class="detail-cell col-span-2">
              <dt>最终提示词</dt>
              <dd class="prompt-block">{{ displayTask.prompt }}</dd>
            </div>
          </template>
          <div v-if="displayTask.error_message" class="detail-cell col-span-2">
            <dt>错误信息</dt>
            <dd class="text-destructive">{{ displayTask.error_message }}</dd>
          </div>
        </dl>

        <!-- Result Images -->
        <div v-if="displayTask.result_image_urls?.length" class="mt-5">
          <h4 class="text-foreground mb-3 text-sm font-semibold">生成结果</h4>
          <div class="flex flex-wrap gap-3">
            <div v-for="(url, i) in displayTask.result_image_urls" :key="i" class="flex flex-col items-center gap-2">
              <DsThumbnail
                :src="url"
                class="bg-muted max-h-100 max-w-100 cursor-zoom-in rounded-md object-contain"
                @click="openImage(url)"
              />
              <Button size="sm" variant="outline" @click="handleDownload(url)">
                <Download />
                下载
              </Button>
            </div>
          </div>
        </div>

        <!-- Input Images -->
        <div v-if="displayTask.input_image_urls?.length" class="mt-5">
          <h4 class="text-foreground mb-3 text-sm font-semibold">参考图片</h4>
          <div class="flex flex-wrap gap-2">
            <DsThumbnail v-for="(url, i) in displayTask.input_image_urls" :key="i" :src="url" class="size-30 rounded-sm object-cover" />
          </div>
        </div>
      </div>

      <DialogFooter v-if="displayTask && !detailLoading && !detailError && $slots.actions" class="flex-wrap">
        <slot name="actions" />
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.detail-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.detail-cell:nth-last-child(-n+2) {
  border-bottom: none;
}
.detail-cell.col-span-2:nth-last-child(-n+2) {
  border-bottom: none;
}
.detail-cell > dt {
  flex-shrink: 0;
  width: 64px;
  color: var(--muted-foreground);
  line-height: 22px;
}
.detail-cell > dd {
  flex: 1;
  min-width: 0;
  line-height: 22px;
  word-break: break-all;
}

.prompt-block {
  white-space: pre-wrap;
  max-height: 160px;
  overflow-y: auto;
}
</style>
