<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Download, Share2 } from '@lucide/vue'
import type { TaskItem } from './TaskList.vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { getFeatureLabel } from '@/configs/featureConfig'
import { useClipboard } from '@/composables/useClipboard'
import { downloadUrl } from '@/utils/download'
import { useImageRetry } from '@/composables/useImageRetry'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
const { copy } = useClipboard()
const { retryOnError } = useImageRetry()

const modelCatalog = useModelCatalogStore()

const props = defineProps<{ task: TaskItem | null }>()
const emit = defineEmits<{ close: []; publish: [task: TaskItem] }>()

const visible = ref(false)

function open() { visible.value = true }
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

      <div v-if="task" class="max-h-[70vh] overflow-y-auto">
        <dl class="grid grid-cols-2 overflow-hidden rounded-lg border text-sm">
          <div class="detail-cell">
            <dt>任务ID</dt>
            <dd class="flex items-center gap-1">
              <span class="font-mono break-all">{{ task.task_no || '-' }}</span>
              <Button v-if="task.task_no" variant="ghost" size="icon-xs" title="复制任务ID" @click="copy(task.task_no || '')">
                <Copy />
              </Button>
            </dd>
          </div>
          <div class="detail-cell">
            <dt>状态</dt>
            <dd>
              <Badge :variant="statusVariant(task.status)">{{ statusMap[task.status] || task.status }}</Badge>
            </dd>
          </div>
          <div class="detail-cell">
            <dt>功能</dt>
            <dd>{{ task.feature_id ? getFeatureLabel(task.feature_id) : '-' }}</dd>
          </div>
          <div class="detail-cell">
            <dt>模型</dt>
            <dd>{{ modelDisplayName(task.model) }}</dd>
          </div>
          <div class="detail-cell">
            <dt>分辨率</dt>
            <dd>{{ task.resolution }}</dd>
          </div>
          <div class="detail-cell">
            <dt>宽高比</dt>
            <dd>{{ task.aspectRatio }}</dd>
          </div>
          <div class="detail-cell">
            <dt>进度</dt>
            <dd>{{ task.progress }}%</dd>
          </div>
          <div class="detail-cell">
            <dt>提交时间</dt>
            <dd>{{ task.created_at }}</dd>
          </div>
          <div class="detail-cell">
            <dt>完成时间</dt>
            <dd>{{ task.completed_at || '-' }}</dd>
          </div>
          <!-- 自由生图：直接显示完整提示词 -->
          <div v-if="!task.feature_id || task.feature_id === 'free-gen'" class="detail-cell col-span-2">
            <dt>提示词</dt>
            <dd class="prompt-block">{{ task.prompt }}</dd>
          </div>

          <!-- 功能/AI摄影：拆分为补充提示词 + 最终提示词 -->
          <template v-else>
            <div class="detail-cell col-span-2">
              <dt>补充提示词</dt>
              <dd class="prompt-block">{{ task.user_prompt || '-' }}</dd>
            </div>
            <div class="detail-cell col-span-2">
              <dt>最终提示词</dt>
              <dd class="prompt-block">{{ task.prompt }}</dd>
            </div>
          </template>
          <div v-if="task.error_message" class="detail-cell col-span-2">
            <dt>错误信息</dt>
            <dd class="text-destructive">{{ task.error_message }}</dd>
          </div>
        </dl>

        <!-- Result Images -->
        <div v-if="task.result_image_urls?.length" class="mt-5">
          <h4 class="text-foreground mb-3 text-sm font-semibold">生成结果</h4>
          <div class="flex flex-wrap gap-3">
            <div v-for="(url, i) in task.result_image_urls" :key="i" class="flex flex-col items-center gap-2">
              <img
                :src="url"
                class="bg-muted max-h-100 max-w-100 cursor-zoom-in rounded-md object-contain"
                @error="retryOnError($event, url)"
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
        <div v-if="task.input_image_urls?.length" class="mt-5">
          <h4 class="text-foreground mb-3 text-sm font-semibold">参考图片</h4>
          <div class="flex flex-wrap gap-2">
            <img v-for="(url, i) in task.input_image_urls" :key="i" :src="url" class="size-30 rounded-sm object-cover" />
          </div>
        </div>
      </div>

      <DialogFooter v-if="task?.status === 'completed' && task?.result_image_urls?.[0]">
        <Button @click="emit('publish', task!)">
          <Share2 />
          发布到作品库
        </Button>
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
  border-bottom: 1px solid var(--momo-color-border-soft);
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
  color: var(--momo-color-text-tertiary);
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
