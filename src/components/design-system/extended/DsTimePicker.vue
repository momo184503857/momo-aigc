<script setup lang="ts">
import { Input } from '../primitives/input'
withDefaults(defineProps<{ modelValue:string; min?:string; max?:string; step?:number; disabled?:boolean; label?:string }>(),{step:60})
defineEmits<{ 'update:modelValue':[value:string]; change:[value:string] }>()
</script>
<template><Input type="time" :model-value="modelValue" :min="min" :max="max" :step="step" :disabled="disabled" :aria-label="label || '选择时间'" @update:model-value="$emit('update:modelValue',String($event));$emit('change',String($event))" /></template>
