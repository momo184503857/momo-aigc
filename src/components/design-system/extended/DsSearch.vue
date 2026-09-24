<script setup lang="ts">
import { Input } from '../primitives/input'
import { Button } from '../primitives/button'
withDefaults(defineProps<{ modelValue:string; placeholder?:string; loading?:boolean; disabled?:boolean }>(),{placeholder:'搜索关键词'})
defineEmits<{ 'update:modelValue':[value:string]; search:[value:string]; clear:[] }>()
</script>
<template><form class="ds-row" role="search" @submit.prevent="!loading && !disabled && $emit('search',modelValue)"><Input :model-value="modelValue" :placeholder="placeholder" aria-label="搜索内容" :disabled="disabled" @update:model-value="$emit('update:modelValue',String($event))" /><Button type="submit" :disabled="disabled || loading">{{ loading?'查询中…':'搜索' }}</Button><Button variant="ghost" :disabled="disabled || !modelValue" @click="$emit('update:modelValue','');$emit('clear')">清空</Button></form></template>
