<script setup lang="ts">
/**
 * PublishWorkDialog - 从已完成的生图任务发布作品到作品库。
 * 可选备注和标签。
 */
import { ref, watch, computed } from 'vue'
import { LoaderCircle, ChevronDown } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { worksApi, adminWorksApi } from '@/services/worksApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import type { TaskItem } from '@/components/TaskList.vue'
import { getFeatureLabel } from '@/configs/featureConfig'
import { useModelCatalogStore } from '@/stores/modelCatalog'

const props = defineProps<{
  visible: boolean
  task: TaskItem | null
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  'published': []
}>()

const { success, error } = useUiFeedback()

const remark = ref('')
const selectedTagIds = ref<number[]>([])
const submitting = ref(false)
const tags = ref<{ id: number; name: string; usage_count: number }[]>([])

const previewImage = computed(() => props.task?.result_image_urls?.[0] || '')

const modelCatalog = useModelCatalogStore()
const modelDisplayName = (modelId: string) => modelCatalog.displayNameFor(modelId)

async function loadTags() {
  try {
    const res = await adminWorksApi.tags()
    tags.value = res.data.data || []
  } catch {
    // 非管理员无法获取标签列表，尝试用公开接口
    try {
      const res = await worksApi.tags()
      tags.value = res.data.data || []
    } catch { /* ignore */ }
  }
}

watch(() => props.visible, (v) => {
  if (v && props.task) {
    remark.value = ''
    selectedTagIds.value = []
    loadTags()
  }
})

async function handleSubmit() {
  if (!props.task) return
  submitting.value = true
  try {
    await worksApi.publish({
      source_task_id: props.task.id,
      remark: remark.value.trim(),
      tagIds: selectedTagIds.value.length > 0 ? selectedTagIds.value : undefined,
    })
    success('作品已发布到作品库')
    emit('update:visible', false)
    emit('published')
  } catch (e: any) {
    const msg = e?.response?.data?.error || '发布失败'
    error(new Error(msg), '发布失败')
  } finally {
    submitting.value = false
  }
}

// ── 纯 UI：标签多选下拉（Popover + Checkbox） ──
const selectedTags = computed(() =>
  tags.value.filter((t) => selectedTagIds.value.includes(t.id)),
)

function toggleTag(id: number) {
  if (selectedTagIds.value.includes(id)) {
    selectedTagIds.value = selectedTagIds.value.filter((x) => x !== id)
  } else {
    selectedTagIds.value = [...selectedTagIds.value, id]
  }
}
</script>

<template>
  <Dialog :open="visible" @update:open="(v) => emit('update:visible', v)">
    <DialogContent class="sm:max-w-xl" @pointer-down-outside.prevent>
      <DialogHeader>
        <DialogTitle>发布到作品库</DialogTitle>
      </DialogHeader>

      <div v-if="task" class="publish-form">
        <!-- 预览 -->
        <div class="preview-row">
          <div class="preview-image">
            <img v-if="previewImage" :src="previewImage" alt="作品预览" />
            <div v-else class="preview-empty">无结果图</div>
          </div>
          <div class="preview-meta">
            <div class="meta-item">
              <span class="meta-label">模式</span>
              <Badge variant="secondary">{{ getFeatureLabel(task.feature_id || 'free-gen') }}</Badge>
            </div>
            <div class="meta-item">
              <span class="meta-label">模型</span>
              <span class="meta-value">{{ modelDisplayName(task.model) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">参数</span>
              <span class="meta-value">{{ task.resolution }} · {{ task.aspectRatio }}</span>
            </div>
          </div>
        </div>

        <!-- 标题 -->
        <div class="publish-form-body">
          <div class="grid gap-1.5">
            <Label for="publish-remark">备注（可选）</Label>
            <Textarea
              id="publish-remark"
              v-model="remark"
              :rows="3"
              placeholder="添加备注..."
              maxlength="500"
            />
            <span class="text-muted-foreground -mt-1 text-right text-xs">{{ remark.length }}/500</span>
          </div>

          <div class="grid gap-1.5">
            <Label>标签（可选）</Label>
            <!-- TODO(multiple-select): EP 多选下拉（multiple）无对应物，用 Popover + Checkbox 列表实现多选（原 allow-create 在本组件无创建标签的 API 调用，未保留） -->
            <Popover>
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-3"
                >
                  <template v-if="selectedTags.length > 0">
                    <Badge v-for="t in selectedTags" :key="t.id" variant="secondary">{{ t.name }}</Badge>
                  </template>
                  <span v-else class="text-muted-foreground">选择或输入标签</span>
                  <ChevronDown class="text-muted-foreground ml-auto size-4 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent class="w-(--reka-popover-trigger-width) p-1" align="start">
                <div class="max-h-56 overflow-y-auto">
                  <label
                    v-for="t in tags"
                    :key="t.id"
                    class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      :model-value="selectedTagIds.includes(t.id)"
                      @update:model-value="toggleTag(t.id)"
                    />
                    <span class="flex-1 truncate">{{ t.name }}</span>
                  </label>
                  <p v-if="tags.length === 0" class="text-muted-foreground px-2 py-3 text-center text-xs">
                    暂无标签
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <!-- 提示词预览 -->
        <div class="prompt-preview">
          <div class="prompt-preview-label">提示词（将随作品公开）</div>
          <div class="prompt-preview-text">{{ task.prompt }}</div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:visible', false)">取消</Button>
        <Button :disabled="submitting" @click="handleSubmit">
          <LoaderCircle v-if="submitting" class="animate-spin" />发布
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.publish-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-row {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: var(--momo-color-bg-soft);
  border-radius: var(--momo-radius-md);
}
.preview-image {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 1px solid var(--momo-color-border-light);
  background: var(--momo-color-bg-muted);
}
.preview-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-placeholder);
}

.preview-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}
.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.meta-label {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-placeholder);
  width: 36px;
}
.meta-value {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
}

.publish-form-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prompt-preview {
  background: var(--momo-color-bg-soft);
  border-radius: var(--momo-radius-sm);
  padding: 10px 12px;
}
.prompt-preview-label {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-placeholder);
  margin-bottom: 6px;
}
.prompt-preview-text {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
  line-height: 1.5;
  max-height: 100px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
