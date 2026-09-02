<script setup lang="ts">
/**
 * FreeGenPage - 自由生图
 * 从原 WorkspacePage 的「自由生图」tab 拎出的独立页面，直接渲染 GenerationForm。
 */
import { ref, watch, onMounted, onActivated, nextTick } from 'vue'

defineOptions({ name: 'FreeGen' })
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success } = useUiFeedback()
import PageLayout from '@/components/PageLayout.vue'
import GenerationForm from '@/components/GenerationForm.vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskManager } from '@/composables/useTaskManager'
import type { ModelId } from '@/types/adapter'

const serverStatus = useServerStatusStore()
const tm = useTaskManager()
const generationForm = ref<InstanceType<typeof GenerationForm>>()

// ─── 生成 ───

async function handleGenerate(params: {
  logicalModelId: number
  prompt: string
  resolution: string
  aspectRatio: string
  count: number
  refImages?: Array<{ url?: string; file?: File }>
  featureId?: string
  userPrompt?: string
  systemPrompt?: string
  supplementaryImages?: { name: string; url: string }[]
}) {
  await tm.handleGenerate(params)
}

// ─── 复制参数（从任务面板跳转回来时） ───

function handleCopyParamsFromTask(params: {
  modelId: string
  prompt: string
  resolution: string
  aspectRatio: string
  input_image_urls: string[]
  feature_id?: string
}) {
  nextTick(() => {
    generationForm.value?.setParams({
      modelId: params.modelId,
      prompt: params.prompt,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      referenceImages: (params.input_image_urls || []).map((url: string) => ({
        dataUrl: url,
        sourceUrl: url,
      })),
    })
    success('参数已复制到表单')
  })
}

// ─── 监听来自任务面板的参数复制事件（仅处理自由生图任务） ───

watch(() => tm.copyParamsEvent.value, (evt) => {
  if (!evt) return
  const task = evt.task
  // 仅处理自由生图任务；功能任务交由 WorkspacePage 处理
  if (task.feature_id && task.feature_id !== 'free-gen') return
  handleCopyParamsFromTask({
    modelId: task.model,
    prompt: task.prompt,
    resolution: task.resolution,
    aspectRatio: task.aspectRatio,
    input_image_urls: task.input_image_urls || [],
    feature_id: task.feature_id,
  })
})

// ─── 生命周期 ───

onMounted(async () => {
  await serverStatus.fetchStatus()

  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    sessionStorage.removeItem('regenerate_task')
    try {
      const params = JSON.parse(stored)
      // 仅处理自由生图任务
      if (params.feature_id && params.feature_id !== 'free-gen') return
      await nextTick()
      handleCopyParamsFromTask(params)
    } catch { /* ignore parse errors */ }
  }
})

onActivated(async () => {
  await serverStatus.fetchStatus()

  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    sessionStorage.removeItem('regenerate_task')
    try {
      const params = JSON.parse(stored)
      if (params.feature_id && params.feature_id !== 'free-gen') return
      await nextTick()
      handleCopyParamsFromTask(params)
    } catch { /* ignore parse errors */ }
  }
})
</script>

<template>
  <PageLayout content-padding="20px">
    <div class="free-gen-layout">
      <GenerationForm ref="generationForm"
        @generate="(p) => handleGenerate({ ...p, featureId: 'free-gen' })" />
    </div>
  </PageLayout>
</template>

<style scoped>
.free-gen-layout {
  height: 100%;
}
</style>
