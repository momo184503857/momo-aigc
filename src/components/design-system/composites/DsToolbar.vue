<script setup lang="ts">
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
defineProps<{ modelValue: string; selectedCount?: number }>()
defineEmits<{ 'update:modelValue': [value: string]; search: []; reset: [] }>()
</script>
<template><div class="ds-row" role="search"><Input aria-label="搜索关键词" placeholder="搜索关键词" :model-value="modelValue" @update:model-value="$emit('update:modelValue', String($event))" @keyup.enter="$emit('search')" /><Button @click="$emit('search')">查询</Button><Button variant="outline" @click="$emit('reset')">重置</Button><span v-if="selectedCount" class="ds-caption">已选择 {{ selectedCount }} 项</span><slot /></div></template>
