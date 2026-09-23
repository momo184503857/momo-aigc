<script setup lang="ts">
/**
 * UiNumberInput — 带 -/+ 步进按钮的数字输入框
 *
 * 数值约束对齐原 EP InputNumber：precision 限制小数位、step 决定步进粒度、
 * stepStrictly 把值吸附到 step 的整数倍。三者均可省略，省略时与迁移初版行为一致。
 */
import { computed, useAttrs } from 'vue'
import { Minus, Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// 关闭默认透传：根节点是布局用的 div，原生属性必须落到真正的 <input>
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: number
  min?: number
  max?: number
  /** 步进粒度，驱动 -/+ 按钮；开启 stepStrictly 时同时作为吸附倍数 */
  step?: number
  /** 保留小数位（>=0），提交前四舍五入，等价原 EP 的 precision */
  precision?: number
  /** 是否把值吸附到 step 的整数倍，等价原 EP 的 step-strictly */
  stepStrictly?: boolean
  disabled?: boolean
}>(), {
  modelValue: undefined,
  min: -Infinity,
  max: Infinity,
  step: 1,
  precision: undefined,
  stepStrictly: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number | undefined]
}>()

const attrs = useAttrs()
// id / name / aria-* 等要落到 <input>，<Label for> 才点得中；class、style 属于外层布局盒（宽度由调用方给）
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))

/** 十进制四舍五入；digits 省略或值非有限数时原样返回 */
function round(value: number, digits?: number) {
  if (digits === undefined || !Number.isFinite(value)) return value
  const factor = 10 ** Math.min(12, Math.max(0, Math.floor(digits)))
  return Math.round(value * factor) / factor
}

/** step 自身的小数位数（0.01 → 2），吸附结果按它舍入可消掉浮点噪声 */
function decimalsOf(value: number) {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/** 顺序与原 EP 一致：先按 step 吸附，再按 precision 舍入，最后夹进 min/max */
function commit(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    emit('update:modelValue', undefined)
    return
  }
  let next = value
  if (props.stepStrictly && props.step > 0) {
    next = round(
      Math.round(next / props.step) * props.step,
      Math.max(props.precision ?? 0, decimalsOf(props.step)),
    )
  }
  next = round(next, props.precision)
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, next)))
}

function bump(delta: number) {
  commit((props.modelValue ?? 0) + delta)
}

function onInput(value: string | number) {
  commit(value === '' ? undefined : Number(value))
}

// Vue 在输入框聚焦期间不回写 DOM，失焦时手动同步，避免「显示 1.234、实际提交 1.23」
function onBlur(event: FocusEvent) {
  const el = event.target as HTMLInputElement | null
  if (!el) return
  const value = props.modelValue
  el.value = value === undefined || Number.isNaN(value) ? '' : String(value)
}
</script>

<template>
  <div v-bind="wrapperAttrs" class="flex w-full items-stretch">
    <Button
      type="button"
      variant="outline"
      size="icon"
      class="rounded-r-none rounded-l-lg"
      :disabled="disabled || (modelValue ?? 0) - step < min"
      @click="bump(-step)"
    >
      <Minus class="size-3.5" />
    </Button>
    <Input
      v-bind="inputAttrs"
      type="number"
      class="-ml-px rounded-none text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="onInput"
      @blur="onBlur"
    />
    <Button
      type="button"
      variant="outline"
      size="icon"
      class="-ml-px rounded-l-none rounded-r-lg"
      :disabled="disabled || (modelValue ?? 0) + step > max"
      @click="bump(step)"
    >
      <Plus class="size-3.5" />
    </Button>
  </div>
</template>
