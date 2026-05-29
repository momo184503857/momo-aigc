<script setup lang="ts">
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

function updateText(value: string) {
  emit('update', { text: value })
}
</script>

<template>
  <div class="config-section">
    <label>文本内容</label>
    <el-input
      :model-value="typeof props.node.config.text === 'string' ? props.node.config.text : ''"
      type="textarea"
      :rows="10"
      placeholder="输入商品信息、卖点或补充说明"
      @update:model-value="updateText"
    />
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
</style>
