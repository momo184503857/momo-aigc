<script setup lang="ts">
/**
 * FreeGenPage - 自由生图
 * 从原 WorkspacePage 的「自由生图」tab 拎出的独立页面，直接渲染 GenerationForm。
 *
 * Layout 口径：本页只做一件事——组参数然后提交。所以页头常驻（标题 + 一句话说明 +
 * 渠道/任务状态），主体是一列有界的编排工作台，滚动与吸底生成栏都归 GenerationForm，
 * 页面不再另加一层滚动容器。
 */
import { ref, watch, onMounted, onActivated, nextTick } from 'vue'

defineOptions({ name: 'FreeGen' })
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success } = useUiFeedback()
import PageLayout from '@/components/PageLayout.vue'
import GenerationForm from '@/components/GenerationForm.vue'
import { Badge } from '@/components/ui/badge'
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
  <PageLayout
    title="自由生图"
    subtitle="参考图 + 提示词 + 出图参数，一次提交；进度与结果看全局任务面板"
  >
    <template #extra>
      <Badge v-if="serverStatus.loaded && !serverStatus.canGenerate" variant="warning">
        无可用渠道
      </Badge>
      <Badge v-else-if="tm.activeTaskCount.value > 0" variant="secondary" class="tabular-nums">
        {{ tm.activeTaskCount.value }} 个任务生成中
      </Badge>
    </template>

    <!-- 单列表单工作台：列宽收成阅读尺度并撑满可用高度，
         GenerationForm 内部的滚动区 + 常驻生成栏因此才有确定的高度 -->
    <div class="mx-auto flex h-full min-h-0 w-full max-w-[1180px] flex-col">
      <GenerationForm ref="generationForm"
        @generate="(p) => handleGenerate({ ...p, featureId: 'free-gen' })" />
    </div>
  </PageLayout>
</template>
