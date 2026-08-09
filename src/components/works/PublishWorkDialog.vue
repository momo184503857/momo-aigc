<script setup lang="ts">
/**
 * PublishWorkDialog - 从已完成的生图任务发布作品到作品库。
 * 预填标题（prompt 前 30 字），可选描述和标签。
 */
import { ref, watch, computed } from 'vue'
import { worksApi, adminWorksApi } from '@/services/worksApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import type { TaskItem } from '@/components/TaskList.vue'
import { getFeatureLabel } from '@/configs/featureConfig'
import { MODELS } from '@/types/adapter'

const props = defineProps<{
  visible: boolean
  task: TaskItem | null
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  'published': []
}>()

const { success, error } = useUiFeedback()

const title = ref('')
const description = ref('')
const selectedTagIds = ref<number[]>([])
const submitting = ref(false)
const tags = ref<{ id: number; name: string; usage_count: number }[]>([])

const previewImage = computed(() => props.task?.result_image_urls?.[0] || '')

const modelDisplayName = (modelId: string) => MODELS.find((m) => m.id === modelId)?.name || modelId

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
    // 预填标题：取 prompt 前 30 字
    title.value = props.task.prompt.slice(0, 30)
    description.value = ''
    selectedTagIds.value = []
    loadTags()
  }
})

async function handleSubmit() {
  if (!props.task) return
  if (!title.value.trim()) {
    error(new Error('标题不能为空'), '发布失败')
    return
  }
  submitting.value = true
  try {
    await worksApi.publish({
      source_task_id: props.task.id,
      title: title.value.trim(),
      description: description.value.trim(),
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
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="发布到作品库"
    width="560px"
    :close-on-click-modal="false"
  >
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
            <el-tag size="small" effect="plain">{{ getFeatureLabel(task.feature_id || 'free-gen') }}</el-tag>
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
      <el-form label-position="top" class="publish-form-body">
        <el-form-item label="标题">
          <el-input v-model="title" placeholder="给作品起个名字" maxlength="60" show-word-limit />
        </el-form-item>

        <el-form-item label="描述（可选）">
          <el-input
            v-model="description"
            type="textarea"
            :rows="3"
            placeholder="说说你的创作思路..."
            maxlength="200"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="标签（可选）">
          <el-select
            v-model="selectedTagIds"
            multiple
            filterable
            allow-create
            placeholder="选择或输入标签"
            style="width: 100%"
          >
            <el-option
              v-for="t in tags"
              :key="t.id"
              :label="t.name"
              :value="t.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 提示词预览 -->
      <div class="prompt-preview">
        <div class="prompt-preview-label">提示词（将随作品公开）</div>
        <div class="prompt-preview-text">{{ task.prompt }}</div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">发布</el-button>
    </template>
  </el-dialog>
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
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md);
}
.preview-image {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color);
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
  color: var(--el-text-color-placeholder);
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
  color: var(--el-text-color-placeholder);
  width: 36px;
}
.meta-value {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
}

.publish-form-body {
  margin: 0;
}

.prompt-preview {
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-sm);
  padding: 10px 12px;
}
.prompt-preview-label {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-bottom: 6px;
}
.prompt-preview-text {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  line-height: 1.5;
  max-height: 100px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
