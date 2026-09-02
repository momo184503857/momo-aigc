<script setup lang="ts">
/**
 * WorkspacePage - 快速生图
 * 任务列表已移至全局 TaskPanel（MainLayout 级别）
 */
import { ref, watch, onMounted, onActivated, nextTick } from 'vue'

defineOptions({ name: 'Workspace' })
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success } = useUiFeedback()
import PageLayout from '@/components/PageLayout.vue'
import FeatureForm from '@/components/FeatureForm.vue'
import FeatureNav from '@/components/FeatureNav.vue'
import type { TabGroup } from '@/components/FeatureNav.vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskManager } from '@/composables/useTaskManager'
import type { ModelId } from '@/types/adapter'

const serverStatus = useServerStatusStore()
const tm = useTaskManager()
const featureForm = ref<InstanceType<typeof FeatureForm>>()

// ─── 功能导航 ───
const FEATURE_NAV_WIDTH = 180
const activeTab = ref('change-clothes')

const tabGroups: TabGroup[] = [
  {
    name: '常用功能',
    tabs: [
      { id: 'change-clothes', label: '换衣服' },
      { id: 'change-bg', label: '换背景' },
      { id: 'change-face', label: '换脸' },
    ],
  },
  {
    name: '商品素材',
    tabs: [
      { id: 'detail-pic', label: '细节图' },
      { id: 'fabric-pic', label: '面料图' },
      { id: 'flat-pic', label: '平铺图' },
      { id: '3d-pic', label: '3D图' },
    ],
  },
  {
    name: '模特资产',
    tabs: [
      { id: 'model-gen', label: '模特生成' },
      { id: 'three-view', label: '三视图' },
    ],
  },
]

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
  supplementaryImages?: { name: string; url: string }[]
}) {
  // 自由生图任务由独立的 FreeGenPage 处理；useTaskManager 已直接路由到 /free-gen，
  // 此处若仍收到 free-gen 数据（残留/直接访问），静默丢弃避免参数丢失。
  if (!params.feature_id || params.feature_id === 'free-gen') {
    return
  }
  const targetTab = params.feature_id
  activeTab.value = targetTab
  nextTick(() => {
    featureForm.value?.setParams({
      modelId: params.modelId,
      prompt: params.prompt,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      referenceImages: (params.input_image_urls || []).map((url: string) => ({
        dataUrl: url,
        sourceUrl: url,
      })),
      supplementaryImages: params.supplementaryImages,
    })
    success('参数已复制到表单')
  })
}

// ─── 监听来自任务面板的参数复制事件 ───
// 自由生图任务由独立的 FreeGenPage 处理，此处忽略 free-gen 任务

watch(() => tm.copyParamsEvent.value, (evt) => {
  if (!evt) return
  const task = evt.task
  if (!task.feature_id || task.feature_id === 'free-gen') return
  handleCopyParamsFromTask({
    modelId: task.model,
    prompt: task.user_prompt || '',
    resolution: task.resolution,
    aspectRatio: task.aspectRatio,
    input_image_urls: task.input_image_urls || [],
    feature_id: task.feature_id,
    supplementaryImages: task.supplementaryImages,
  })
})

// ─── 生命周期 ───

onMounted(async () => {
  await serverStatus.fetchStatus()

  // Check for pending regenerate from cross-page navigation
  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    sessionStorage.removeItem('regenerate_task')
    try {
      const params = JSON.parse(stored)
      await nextTick()
      handleCopyParamsFromTask(params)
    } catch { /* ignore parse errors */ }
  }
})

onActivated(async () => {
  await serverStatus.fetchStatus()

  // Check for pending regenerate (also on activated for KeepAlive)
  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    sessionStorage.removeItem('regenerate_task')
    try {
      const params = JSON.parse(stored)
      await nextTick()
      handleCopyParamsFromTask(params)
    } catch { /* ignore parse errors */ }
  }
})
</script>

<template>
  <PageLayout content-padding="0">
    <div class="workspace-layout">
      <!-- Feature Navigation -->
      <div class="feature-nav" :style="{ width: FEATURE_NAV_WIDTH + 'px' }">
        <FeatureNav :groups="tabGroups" :active-tab="activeTab" @select="activeTab = $event" />
      </div>

      <!-- Content Panel -->
      <div class="content-panel">
        <FeatureForm :key="activeTab" ref="featureForm" :feature-id="activeTab"
          @generate="(p) => handleGenerate({ ...p, featureId: activeTab })" />
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.workspace-layout {
  display: flex; height: 100%; gap: 0;
  user-select: none;
}

.feature-nav {
  flex-shrink: 0;
  overflow: hidden;
}

.content-panel {
  flex: 1;
  padding: 20px; overflow: hidden;
  border-left: 1px solid var(--el-border-color-lighter);
}
</style>
