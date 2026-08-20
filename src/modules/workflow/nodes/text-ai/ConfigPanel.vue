<script setup lang="ts">
import type { WorkflowNode } from '@/modules/workflow/types/workflow'
import { useModelCatalogStore } from '@/stores/modelCatalog'

const modelCatalog = useModelCatalogStore()
modelCatalog.ensureLoaded()

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

function val(key: string, fallback = ''): string {
  const v = props.node.config[key]
  return typeof v === 'string' ? v : fallback
}
function boolVal(key: string): boolean {
  return Boolean(props.node.config[key])
}
</script>

<template>
  <div class="config-section">
    <el-alert title="API 密钥已在管理后台统一配置" type="info" show-icon :closable="false" />

    <label>模型名称</label>
    <el-select :model-value="val('modelName')" placeholder="选择文字模型" style="width: 100%" @update:model-value="emit('update', { modelName: $event })">
      <template v-if="modelCatalog.loaded">
        <template v-for="group in modelCatalog.textGroups" :key="group.providerId">
          <el-option-group :label="group.providerName">
            <el-option
              v-for="m in group.models"
              :key="m.id"
              :label="m.displayName"
              :value="m.modelId"
            />
          </el-option-group>
        </template>
      </template>
    </el-select>

    <el-divider>节点提示词</el-divider>

    <label>任务指令</label>
    <el-input :model-value="val('taskPrompt')" type="textarea" :rows="5" placeholder="例如：你是电商主图提示词生成专家..." @update:model-value="emit('update', { taskPrompt: $event })" />

    <label>补充细节</label>
    <el-input :model-value="val('detailPrompt')" type="textarea" :rows="5" placeholder="例如：商品是黑色连衣裙，目标人群是..." @update:model-value="emit('update', { detailPrompt: $event })" />

    <el-switch :model-value="boolVal('pauseAfterRun')" active-text="运行后暂停确认" @update:model-value="emit('update', { pauseAfterRun: Boolean($event) })" />

    <el-divider>高级参数</el-divider>

    <label>温度 (Temperature)</label>
    <el-input :model-value="props.node.config.temperature ?? ''" placeholder="0.0 - 2.0，留空使用默认" @update:model-value="emit('update', { temperature: $event ? Number($event) : undefined })" />

    <label>最大 Tokens</label>
    <el-input :model-value="props.node.config.maxTokens ?? ''" placeholder="如 4096，留空使用默认" @update:model-value="emit('update', { maxTokens: $event ? Number($event) : undefined })" />
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
</style>
