<script setup lang="ts">
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const saveDir = typeof props.node.config.saveDir === 'string' ? props.node.config.saveDir : ''
</script>

<template>
  <div class="config-section">
    <el-alert title="保存目录为项目级配置，修改后所有保存节点共用。" type="info" show-icon :closable="false" />

    <label>保存目录</label>
    <el-input :model-value="saveDir" placeholder="未设置，运行时将弹出选择框" readonly />
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
</style>
