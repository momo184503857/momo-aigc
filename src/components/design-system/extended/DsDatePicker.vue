<script setup lang="ts">
import { Input } from '../primitives/input'
defineProps<{ modelValue:string; min?:string; max?:string; disabled?:boolean; label?:string }>()
defineEmits<{ 'update:modelValue':[value:string]; change:[value:string] }>()
</script>
<template><Input type="date" :model-value="modelValue" :min="min" :max="max" :disabled="disabled" :aria-label="label || '选择日期'" @update:model-value="$emit('update:modelValue',String($event));$emit('change',String($event))" /></template>
