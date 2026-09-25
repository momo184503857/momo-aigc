<script setup lang="ts">
/**
 * PhotographyPage — AI摄影页面
 * 图片池 → 元素分配 → 生成，任务与全局 TaskPanel 共用。
 *
 * Layout 口径：compose→generate 工作台。页面只提供常驻页头（名称 + 流程说明 + 渠道/任务状态）
 * 与一列有界工作台，滚动和吸底生成栏由 PhotographyForm 自己承担；
 * 原先套在外层的 user-select:none 已删除（它会连带禁掉提示词的文本选择）。
 */
import { ref, watch, onMounted, onActivated, nextTick } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success } = useUiFeedback()
import { DsScrollPage as PageLayout } from '@/components/design-system'
import PhotographyForm from '@/components/PhotographyForm.vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskManager } from '@/composables/useTaskManager'

defineOptions({ name: 'Photography' })

const serverStatus = useServerStatusStore()
const tm = useTaskManager()
const photographyForm = ref<InstanceType<typeof PhotographyForm>>()

// ─── Generate ───
async function handleGenerate(params: {
  logicalModelId: number
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
    logicalModelId: params.logicalModelId,
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
    <!-- 有界工作台列：PhotographyForm 自带内部滚动与吸底生成栏，页面不再套第二层滚动 -->
    <div class="mx-auto flex h-full min-h-0 w-full max-w-[1240px] flex-col">
      <PhotographyForm ref="photographyForm" @generate="handleGenerate" />
    </div>
  </PageLayout>
</template>
