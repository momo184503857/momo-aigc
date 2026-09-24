<script setup lang="ts">
import { computed } from 'vue'
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '../primitives/select'
import type {DsTreeNode} from './tree'
const props=defineProps<{ modelValue:string[]; options:DsTreeNode[]; disabled?:boolean }>()
const emit=defineEmits<{ 'update:modelValue':[value:string[]]; change:[value:string[]] }>()
const levels=computed(()=>{const result:DsTreeNode[][]=[props.options];let nodes=props.options;for(const id of props.modelValue){const children=nodes.find(n=>n.id===id)?.children;if(!children?.length)break;result.push(children);nodes=children}return result})
function change(level:number,value:unknown){const next=[...props.modelValue.slice(0,level),String(value)];emit('update:modelValue',next);emit('change',next)}
</script>
<template><div class="ds-row"><Select v-for="(nodes,index) in levels" :key="index" :model-value="modelValue[index] || ''" :disabled="disabled" @update:model-value="change(index,$event)"><SelectTrigger :aria-label="`第 ${index+1} 级分类`"><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent><SelectItem v-for="node in nodes" :key="node.id" :value="node.id" :disabled="node.disabled">{{ node.label }}</SelectItem></SelectContent></Select></div></template>
