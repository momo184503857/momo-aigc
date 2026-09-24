<script setup lang="ts">
import { computed,ref } from 'vue'
import { Popover,PopoverTrigger,PopoverContent } from '../primitives/popover'
import { Button } from '../primitives/button'
import DsTree from './DsTree.vue'
import {flattenTree,type DsTreeNode} from './tree'
const props=defineProps<{ modelValue?:string; nodes:DsTreeNode[]; disabled?:boolean; placeholder?:string }>()
const emit=defineEmits<{ 'update:modelValue':[value:string]; change:[value:string] }>()
const open=ref(false)
const label=computed(()=>flattenTree(props.nodes).find(x=>x.node.id===props.modelValue)?.node.label)
</script>
<template><Popover v-model:open="open"><PopoverTrigger as-child><Button variant="outline" :disabled="disabled">{{ label || placeholder || '选择树节点' }}</Button></PopoverTrigger><PopoverContent><DsTree :nodes="nodes" :model-value="modelValue" @update:model-value="emit('update:modelValue',$event);emit('change',$event);open=false" /></PopoverContent></Popover></template>
