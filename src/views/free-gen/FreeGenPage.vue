<script setup lang="ts">
// 正式自由生图工作台：真实生成表单与任务结果双栏。
import { ref, watch, onMounted, onActivated, nextTick } from 'vue'

defineOptions({ name: 'FreeGen' })
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success } = useUiFeedback()
import FreeGenResults from './FreeGenResults.vue'
import GenerationForm from '@/components/GenerationForm.vue'

import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskManager } from '@/composables/useTaskManager'

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

async function handleCopyParamsFromTask(params: {
  logicalModelId?: number | null
  modelId: string
  prompt: string
  resolution: string
  aspectRatio: string
  input_image_urls: string[]
  feature_id?: string
  promptSegments?: Record<string, string>
  negativePrompt?: string
}) {
  await nextTick()
  await generationForm.value?.setParams({
    logicalModelId: params.logicalModelId,
    modelId: params.modelId,
    prompt: params.prompt,
    resolution: params.resolution,
    aspectRatio: params.aspectRatio,
    referenceImages: (params.input_image_urls || []).map((url: string) => ({
      dataUrl: url,
      sourceUrl: url,
    })),
    promptSegments: params.promptSegments,
    negativePrompt: params.negativePrompt,
  })
  success('参数已复用，生图张数保持不变')
}

// ─── 监听来自任务面板的参数复制事件（仅处理自由生图任务） ───

watch(() => tm.copyParamsEvent.value, (evt) => {
  if (!evt) return
  const task = evt.task
  // 仅处理自由生图任务；功能任务交由 WorkspacePage 处理
  if (task.feature_id && task.feature_id !== 'free-gen') return
  handleCopyParamsFromTask({
    logicalModelId: task.logical_model_id,
    modelId: task.model,
    prompt: task.prompt,
    resolution: task.resolution,
    aspectRatio: task.aspectRatio,
    input_image_urls: task.input_image_urls || [],
    feature_id: task.feature_id,
    promptSegments: task.prompt_segments,
    negativePrompt: task.negative_prompt,
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
      await handleCopyParamsFromTask({ ...params, modelId: params.modelId || params.model })
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
      await handleCopyParamsFromTask({ ...params, modelId: params.modelId || params.model })
    } catch { /* ignore parse errors */ }
  }
})
</script>

<template>
  <main class="free-gen-studio" aria-label="自由生图工作台">
    <GenerationForm ref="generationForm" @generate="(p) => handleGenerate({ ...p, featureId: 'free-gen' })" />
    <FreeGenResults @reuse="tm.handleCopyParams" />
  </main>
</template>

<style scoped>
.free-gen-studio{height:100%;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--momo-space-5);padding:var(--momo-space-6);background:var(--momo-color-bg-page)}
@media(max-width:800px){.free-gen-studio{overflow:auto;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(640px,80svh) minmax(480px,70svh);padding:var(--momo-space-3);gap:var(--momo-space-3)}}
</style>
