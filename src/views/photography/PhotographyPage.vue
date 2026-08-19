<script setup lang="ts">
/**
 * PhotographyPage — AI摄影页面
 * 图片池 → 元素分配 → 生成，任务与全局 TaskPanel 共用。
 */
import { ref, watch, onMounted, onActivated, nextTick } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success } = useUiFeedback()
import PageLayout from '@/components/PageLayout.vue'
import PhotographyForm from '@/components/PhotographyForm.vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskManager } from '@/composables/useTaskManager'
import type { ModelId } from '@/types/adapter'

defineOptions({ name: 'Photography' })

const serverStatus = useServerStatusStore()
const tm = useTaskManager()
const photographyForm = ref<InstanceType<typeof PhotographyForm>>()

// ─── Generate ───
async function handleGenerate(params: {
  channelModelId: number
  prompt: string
  resolution: string
  aspectRatio: string
  count: number
  refImages: Array<{ url?: string; file?: File }>
  featureId: string
  userPrompt: string
  systemPrompt: string
  supplementaryImages: { name: string; url: string }[]
}) {
  await tm.handleGenerate({
    channelModelId: params.channelModelId,
    prompt: params.prompt,
    resolution: params.resolution,
    aspectRatio: params.aspectRatio,
    count: params.count,
    refImages: params.refImages,
    featureId: params.featureId,
    userPrompt: params.userPrompt,
    systemPrompt: params.systemPrompt,
    supplementaryImages: params.supplementaryImages,
  })
}

// ─── Copy params from task list (re-edit) ───
watch(() => tm.copyParamsEvent.value, (evt) => {
  if (!evt) return
  const task = evt.task
  if (task.feature_id !== 'ai-photography') return

  // Navigate to photography page if not here
  nextTick(() => {
    photographyForm.value?.setParams({
      modelId: task.model,
      resolution: task.resolution,
      aspectRatio: task.aspectRatio,
      userPrompt: task.user_prompt || '',
      supplementaryImages: task.supplementaryImages,
    })
    success('参数已复制到表单')
  })
})

// ─── Lifecycle ───
onMounted(async () => {
  await serverStatus.fetchStatus()

  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    try {
      const params = JSON.parse(stored)
      if (params.feature_id === 'ai-photography') {
        sessionStorage.removeItem('regenerate_task')
        await nextTick()
        photographyForm.value?.setParams(params)
      }
    } catch { /* ignore */ }
  }
})

onActivated(async () => {
  await serverStatus.fetchStatus()

  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    try {
      const params = JSON.parse(stored)
      if (params.feature_id === 'ai-photography') {
        sessionStorage.removeItem('regenerate_task')
        await nextTick()
        photographyForm.value?.setParams(params)
      }
    } catch { /* ignore */ }
  }
})
</script>

<template>
  <PageLayout content-padding="0">
    <div class="photography-layout">
      <div class="content-panel">
        <PhotographyForm ref="photographyForm" @generate="handleGenerate" />
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.photography-layout {
  display: flex; height: 100%;
  user-select: none;
}

.content-panel {
  flex: 1;
  padding: 24px;
  overflow: hidden;
}
</style>
