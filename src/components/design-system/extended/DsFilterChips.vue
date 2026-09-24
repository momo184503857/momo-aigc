<script setup lang="ts">
import { Button } from '../primitives/button'
const props=defineProps<{ modelValue:string[]; options:{value:string;label:string;disabled?:boolean}[] }>()
const emit=defineEmits<{ 'update:modelValue':[value:string[]]; change:[value:string[]] }>()
function toggle(value:string){const next=props.modelValue.includes(value)?props.modelValue.filter(v=>v!==value):[...props.modelValue,value];emit('update:modelValue',next);emit('change',next)}
</script>
<template><div class="ds-row" role="group" aria-label="筛选条件"><Button v-for="option in options" :key="option.value" size="sm" :variant="modelValue.includes(option.value)?'default':'outline'" :disabled="option.disabled" :aria-pressed="modelValue.includes(option.value)" @click="toggle(option.value)">{{ option.label }}</Button></div></template>
