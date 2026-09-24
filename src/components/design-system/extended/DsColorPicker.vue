<script setup lang="ts">
import { Input } from '../primitives/input'
defineProps<{ modelValue:string; disabled?:boolean }>()
defineEmits<{ 'update:modelValue':[value:string]; change:[value:string] }>()
</script>
<template><div class="ds-row"><Input type="color" :model-value="modelValue" :disabled="disabled" aria-label="选择颜色" @update:model-value="$emit('update:modelValue',String($event));$emit('change',String($event))" /><code>{{ modelValue }}</code></div></template>
