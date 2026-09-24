<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '../primitives/button'
import type { DsTreeNode } from './tree'
defineProps<{ nodes:DsTreeNode[]; modelValue?:string; disabled?:boolean }>()
const emit=defineEmits<{ 'update:modelValue':[value:string]; select:[node:DsTreeNode] }>()
const expanded=ref<string[]>([])
function toggle(id:string){expanded.value=expanded.value.includes(id)?expanded.value.filter(v=>v!==id):[...expanded.value,id]}
</script>
<template><ul class="ds-tree"><li v-for="node in nodes" :key="node.id"><div class="ds-row"><Button v-if="node.children?.length" variant="ghost" size="sm" :aria-expanded="expanded.includes(node.id)" :aria-label="`${expanded.includes(node.id)?'收起':'展开'}${node.label}`" :disabled="disabled || node.disabled" @click="toggle(node.id)">{{ expanded.includes(node.id)?'−':'+' }}</Button><Button :variant="modelValue===node.id?'default':'ghost'" :aria-pressed="modelValue===node.id" :disabled="disabled || node.disabled" @click="emit('update:modelValue',node.id);emit('select',node)">{{ node.label }}</Button></div><DsTree v-if="node.children && expanded.includes(node.id)" :nodes="node.children" :model-value="modelValue" :disabled="disabled || node.disabled" @update:model-value="emit('update:modelValue',$event)" @select="emit('select',$event)" /></li></ul></template>
