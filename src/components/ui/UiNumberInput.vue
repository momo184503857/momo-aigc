<script setup lang="ts">
/**
 * UiNumberInput — 数字输入框（带 +/- 按钮）
 * 封装 el-input-number，统一 UI 样式
 */
import { computed } from 'vue'

interface Props {
  modelValue: number | undefined
  min?: number
  max?: number
  step?: number
  precision?: number
  placeholder?: string
  disabled?: boolean
  size?: 'large' | 'default' | 'small'
  controlsPosition?: '' | 'right'
  width?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: undefined,
  max: undefined,
  step: 1,
  precision: undefined,
  placeholder: '',
  disabled: false,
  size: 'default',
  controlsPosition: '',
  width: '100%',
})

const emit = defineEmits<{
  'update:modelValue': [value: number | undefined]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <el-input-number
    v-model="value"
    class="ui-number-input"
    :class="{ 'ui-number-input--right': controlsPosition === 'right' }"
    :min="min"
    :max="max"
    :step="step"
    :precision="precision"
    :placeholder="placeholder"
    :disabled="disabled"
    :size="size"
    :controls-position="controlsPosition"
    :style="{ width }"
  />
</template>

<style scoped>
.ui-number-input {
  width: 100%;
}

.ui-number-input :deep(.el-input__wrapper) {
  padding-left: 40px;
  padding-right: 40px;
}

.ui-number-input :deep(.el-input-number__decrease),
.ui-number-input :deep(.el-input-number__increase) {
  width: 36px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  transition: background-color 0.2s, color 0.2s;
}

.ui-number-input :deep(.el-input-number__decrease:hover),
.ui-number-input :deep(.el-input-number__increase:hover) {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}

.ui-number-input :deep(.el-input-number__decrease:active),
.ui-number-input :deep(.el-input-number__increase:active) {
  background: var(--el-fill-color-dark);
}

.ui-number-input :deep(.el-input-number__decrease.is-disabled),
.ui-number-input :deep(.el-input-number__increase.is-disabled) {
  color: var(--el-text-color-placeholder);
  cursor: not-allowed;
}

.ui-number-input :deep(.el-input-number__decrease) {
  border-radius: var(--el-border-radius-base) 0 0 var(--el-border-radius-base);
  border-right: 1px solid var(--el-border-color);
}

.ui-number-input :deep(.el-input-number__increase) {
  border-radius: 0 var(--el-border-radius-base) var(--el-border-radius-base) 0;
  border-left: 1px solid var(--el-border-color);
}

/* 右侧控制按钮模式 */
.ui-number-input--right :deep(.el-input__wrapper) {
  padding-left: 11px;
  padding-right: 52px;
}

.ui-number-input--right :deep(.el-input-number__decrease),
.ui-number-input--right :deep(.el-input-number__increase) {
  width: 26px;
  height: 50%;
  border: none;
  border-left: 1px solid var(--el-border-color);
}

.ui-number-input--right :deep(.el-input-number__decrease) {
  border-radius: 0 0 var(--el-border-radius-base) 0;
  border-bottom: none;
}

.ui-number-input--right :deep(.el-input-number__increase) {
  border-radius: 0 var(--el-border-radius-base) 0 0;
}

/* 移除默认的圆角，让按钮和输入框融合 */
.ui-number-input :deep(.el-input__wrapper) {
  border-radius: var(--el-border-radius-base);
}

.ui-number-input :deep(.el-input-number__decrease:hover),
.ui-number-input :deep(.el-input-number__increase:hover) {
  color: var(--el-color-primary);
}
</style>
