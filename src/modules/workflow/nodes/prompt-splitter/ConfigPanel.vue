<script setup lang="ts">
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

function val(key: string, fallback = ''): string {
  const v = props.node.config[key]
  return typeof v === 'string' ? v : fallback
}
function boolVal(key: string, fallback = true): boolean {
  const v = props.node.config[key]
  return v !== undefined ? Boolean(v) : fallback
}
</script>

<template>
  <div class="config-section">
    <label>分隔符</label>
    <el-input :model-value="val('delimiter', '---')" placeholder="---" @update:model-value="emit('update', { delimiter: $event })" />

    <el-switch :model-value="boolVal('trimWhitespace')" active-text="去除首尾空白" @update:model-value="emit('update', { trimWhitespace: Boolean($event) })" />

    <el-switch :model-value="boolVal('ignoreEmpty')" active-text="忽略空段落" @update:model-value="emit('update', { ignoreEmpty: Boolean($event) })" />
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
</style>
