<script setup lang="ts">
import { computed } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const modelCatalog = useModelCatalogStore()
modelCatalog.ensureLoaded()

const visionModels = computed(() =>
  modelCatalog.visionTextModels.map((m) => ({ value: m.id, label: m.displayName }))
)
const noVisionModel = computed(() => visionModels.value.length === 0)

const qaPrompt = computed(() => {
  const v = props.node.config.qaPrompt
  return typeof v === 'string' ? v : ''
})

const strict = computed(() => props.node.config.strict === true)

function onModelChange(modelId: number) {
  const model = modelCatalog.getModel(modelId)
  emit('update', { channelModelId: modelId, modelName: model?.modelId ?? '' })
}
</script>

<template>
  <div class="config-section">
    <el-alert
      title="识图模型对全部输入图组检；不合格时自动生成修正指令并重跑对应生图节点（最多 2 轮）。"
      type="info"
      show-icon
      :closable="false"
    />

    <label>识图模型{{ noVisionModel ? '（暂无支持识图的模型，将退用普通文字模型，结果可能不可靠）' : '' }}</label>
    <el-select
      :model-value="props.node.config.channelModelId"
      placeholder="选择识图模型"
      @update:model-value="onModelChange(Number($event))"
    >
      <el-option v-for="m in visionModels" :key="m.value" :label="m.label" :value="m.value" />
    </el-select>

    <label>质检提示词（检查清单）</label>
    <el-input
      :model-value="qaPrompt"
      type="textarea"
      :rows="10"
      @update:model-value="emit('update', { qaPrompt: $event })"
    />

    <el-switch
      :model-value="strict"
      active-text="严格模式（重试耗尽仍不合格则置失败）"
      @update:model-value="emit('update', { strict: Boolean($event) })"
    />
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
</style>
