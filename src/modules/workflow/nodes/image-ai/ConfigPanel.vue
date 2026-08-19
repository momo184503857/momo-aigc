<script setup lang="ts">
import { computed } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { UiNumberInput } from '@/components/ui'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const modelCatalog = useModelCatalogStore()
modelCatalog.ensureLoaded()

const availableModels = computed(() =>
  modelCatalog.imageGroups.flatMap((g) => g.models.map((m) => ({
    value: m.logicalCode ?? m.modelId,
    label: g.mine ? `${m.displayName}（个人）` : m.displayName,
  }))))

const selectedModel = computed(() => modelCatalog.getModelByName(String(props.node.config.modelName || '')))

const validAspectRatios = computed(() => {
  const model = selectedModel.value
  if (!model) return ['1:1']
  return modelCatalog.aspectRatiosFor(model, String(props.node.config.outputSize || '2K'))
})

const validResolutions = computed(() => {
  const model = selectedModel.value
  if (!model) return ['2K']
  return model.capabilities?.resolutions ?? ['2K']
})

const imageCount = computed(() => {
  const v = props.node.config.imageCount
  return typeof v === 'number' && v >= 1 && v <= 9 ? v : 3
})
</script>

<template>
  <div class="config-section">
    <el-alert title="API 密钥已在管理后台统一配置" type="info" show-icon :closable="false" />

    <label>模型名称</label>
    <el-select :model-value="props.node.config.modelName" @update:model-value="emit('update', { modelName: $event })">
      <el-option v-for="m in availableModels" :key="m.value" :label="m.label" :value="m.value" />
    </el-select>

    <el-divider>生成参数</el-divider>

    <label>画幅比例</label>
    <el-select :model-value="props.node.config.aspectRatio" @update:model-value="emit('update', { aspectRatio: $event })">
      <el-option v-for="r in validAspectRatios" :key="r" :label="r" :value="r" />
    </el-select>

    <label>输出尺寸</label>
    <el-select :model-value="props.node.config.outputSize" @update:model-value="emit('update', { outputSize: $event })">
      <el-option v-for="res in validResolutions" :key="res" :label="res" :value="res" />
    </el-select>

    <el-divider>输入端口</el-divider>

    <label>参考图数量</label>
    <UiNumberInput :model-value="imageCount" :min="1" :max="9" @update:model-value="emit('update', { imageCount: $event })" />
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
</style>
