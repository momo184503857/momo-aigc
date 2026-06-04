<script setup lang="ts">
import { ref } from 'vue'
import { Download } from '@element-plus/icons-vue'
import type { TaskItem } from './TaskList.vue'
import { MODELS } from '@/types/adapter'
import { getFeatureLabel } from '@/configs/featureConfig'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { downloadUrl } from '@/utils/download'
const { success, info, warning, error } = useUiFeedback()

const props = defineProps<{ task: TaskItem | null }>()
const emit = defineEmits<{ close: [] }>()

const visible = ref(false)

function open() { visible.value = true }
function close() { visible.value = false; emit('close') }

defineExpose({ open, close })

function modelDisplayName(modelId: string): string {
  const m = MODELS.find((m) => m.id === modelId)
  return m?.name || modelId
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => success('已复制'))
}

function openImage(url: string) {
  window.open(url, '_blank')
}

async function handleDownload(url: string) {
  await downloadUrl(url, 'result.png')
}

const statusMap: Record<string, string> = {
  submitted: '已提交', queued: '排队中', in_progress: '生成中',
  completed: '已完成', failed: '生成失败', unknown: '状态未知',
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="任务详情"
    :width="'var(--tf-dialog-lg, 1000px)'"
    @close="close"
  >
    <div v-if="task" class="detail-content">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="任务ID">{{ task.toapis_task_id }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="task.status === 'completed' ? 'success' : task.status === 'failed' ? 'danger' : 'info'" size="small">
            {{ statusMap[task.status] || task.status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="功能">{{ task.feature_id ? getFeatureLabel(task.feature_id) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="模型">{{ modelDisplayName(task.model) }}</el-descriptions-item>
        <el-descriptions-item label="分辨率">{{ task.resolution }}</el-descriptions-item>
        <el-descriptions-item label="宽高比">{{ task.aspectRatio }}</el-descriptions-item>
        <el-descriptions-item label="进度">{{ task.progress }}%</el-descriptions-item>
        <el-descriptions-item label="提交时间">{{ task.created_at }}</el-descriptions-item>
        <el-descriptions-item label="完成时间">{{ task.completed_at || '-' }}</el-descriptions-item>
        <el-descriptions-item label="提示词" :span="2">
          <div class="prompt-block">
            {{ task.feature_id && task.feature_id !== 'free-gen' ? (task.user_prompt || '') : task.prompt }}
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="错误信息" :span="2" v-if="task.error_message">
          <span style="color: var(--el-color-danger)">{{ task.error_message }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <!-- Result Images -->
      <div v-if="task.result_image_urls?.length" class="result-section">
        <h4>生成结果</h4>
        <div class="result-images">
          <div v-for="(url, i) in task.result_image_urls" :key="i" class="result-img-wrap">
            <img :src="url" class="result-img" @click="openImage(url)" />
            <el-button size="small" :icon="Download" @click="handleDownload(url)">下载</el-button>
          </div>
        </div>
      </div>

      <!-- Input Images -->
      <div v-if="task.input_image_urls?.length" class="result-section">
        <h4>参考图片</h4>
        <div class="ref-images">
          <img v-for="(url, i) in task.input_image_urls" :key="i" :src="url" class="ref-img" />
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.detail-content { max-height: 70vh; overflow-y: auto; }

.prompt-block {
  white-space: pre-wrap; word-break: break-all;
  max-height: 160px; overflow-y: auto;
}

.result-section { margin-top: 20px; }
.result-section h4 { margin-bottom: 12px; color: var(--el-text-color-primary); }

.result-images { display: flex; gap: 12px; flex-wrap: wrap; }
.result-img-wrap { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.result-img {
  max-width: 400px; max-height: 400px;
  border-radius: var(--momo-radius-md); cursor: pointer;
  object-fit: contain; background: var(--el-fill-color);
}
.ref-images { display: flex; gap: 8px; flex-wrap: wrap; }
.ref-img {
  width: 120px; height: 120px;
  border-radius: var(--momo-radius-sm); object-fit: cover;
}
</style>
