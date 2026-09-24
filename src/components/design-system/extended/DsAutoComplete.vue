<script setup lang="ts">
import { computed } from 'vue'
import { ComboboxRoot,ComboboxAnchor,ComboboxInput,ComboboxContent,ComboboxItem,ComboboxEmpty } from 'reka-ui'
import { useDesignSystem } from '../context'
const props=defineProps<{ modelValue:string; options:{value:string;label:string;disabled?:boolean}[]; disabled?:boolean; placeholder?:string }>()
const emit=defineEmits<{ 'update:modelValue':[value:string]; select:[value:string] }>()
const filtered=computed(()=>props.options.filter(o=>o.label.includes(props.modelValue)))
useDesignSystem()
</script>
<template><ComboboxRoot :model-value="modelValue" :disabled="disabled" :ignore-filter="true" @update:model-value="emit('update:modelValue',String($event));emit('select',String($event))"><ComboboxAnchor><ComboboxInput class="ds-control" :model-value="modelValue" :placeholder="placeholder || '输入关键词选择'" aria-label="自动完成" @update:model-value="emit('update:modelValue',$event)" /></ComboboxAnchor><ComboboxContent class="ds-panel ds-stack"><ComboboxEmpty>无匹配选项</ComboboxEmpty><ComboboxItem v-for="option in filtered" :key="option.value" :value="option.value" :disabled="option.disabled" class="ds-option">{{ option.label }}</ComboboxItem></ComboboxContent></ComboboxRoot></template>
