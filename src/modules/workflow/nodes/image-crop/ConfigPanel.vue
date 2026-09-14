<script setup lang="ts">
import { computed } from 'vue'
import { UiNumberInput } from '@/components/ui'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const ratioOptions = [
  { value: '1:1', label: '1:1（方图）' },
  { value: '3:4', label: '3:4（竖版主图）' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16（竖版长图）' },
  { value: '16:9', label: '16:9' },
  { value: 'custom', label: '自定义' },
]

const ratio = computed(() => {
  const v = props.node.config.ratio
  return typeof v === 'string' && ratioOptions.some((o) => o.value === v) ? v : '3:4'
})

const customW = computed(() => {
  const v = props.node.config.customW
  return typeof v === 'number' && v > 0 ? v : 3
})

const customH = computed(() => {
  const v = props.node.config.customH
  return typeof v === 'number' && v > 0 ? v : 4
})
</script>

<template>
  <div class="config-section">
    <el-alert
      title="确定性居中裁切：保持较长边不变，两侧等量裁掉多余部分。不缩放、不用 AI 重绘。"
      type="info"
      show-icon
      :closable="false"
    />

    <label>目标比例</label>
    <el-select :model-value="ratio" @update:model-value="emit('update', { ratio: $event })">
      <el-option v-for="o in ratioOptions" :key="o.value" :label="o.label" :value="o.value" />
    </el-select>

    <template v-if="ratio === 'custom'">
      <label>自定义宽高（W:H）</label>
      <div class="custom-ratio-row">
        <UiNumberInput :model-value="customW" :min="1" :max="9999" @update:model-value="emit('update', { customW: $event })" />
        <span class="ratio-sep">:</span>
        <UiNumberInput :model-value="customH" :min="1" :max="9999" @update:model-value="emit('update', { customH: $event })" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.config-section label { color: var(--el-text-color-regular); font-size: var(--el-font-size-small); }
.custom-ratio-row { display: flex; align-items: center; gap: 8px; }
.ratio-sep { color: var(--el-text-color-secondary); }
</style>
