<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const content = computed(() => {
  const v = props.node.config.content
  return typeof v === 'string' ? v : ''
})

const mergeMode = computed(() =>
  props.node.config.mergeMode === 'upstream-first' ? 'upstream-first' : 'rules-first'
)
</script>

<template>
  <div class="config-section">
    <label>知识库内容（规则、背景基调、检查清单等大段文本）</label>
    <el-input
      :model-value="content"
      type="textarea"
      :rows="14"
      placeholder="例如：主图背景基调统一规则、动作多样性与证据规则、质检标准…"
      @update:model-value="emit('update', { content: $event })"
    />

    <label>与上游文本的合并顺序</label>
    <el-radio-group :model-value="mergeMode" @update:model-value="emit('update', { mergeMode: $event })">
      <el-radio value="rules-first">知识库在前</el-radio>
      <el-radio value="upstream-first">上游在前</el-radio>
    </el-radio-group>
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
</style>
