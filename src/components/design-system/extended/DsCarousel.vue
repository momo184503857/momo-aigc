<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '../primitives/button'
const props=defineProps<{ modelValue: number; items: { src:string; alt:string }[] }>()
const emit=defineEmits<{ 'update:modelValue': [value:number] }>()
const current=computed(()=>Math.min(Math.max(0,props.modelValue),Math.max(0,props.items.length-1)))
function step(delta:number){ if(props.items.length)emit('update:modelValue',(current.value+delta+props.items.length)%props.items.length) }
</script>
<template><section class="ds-stack" aria-roledescription="轮播图" aria-label="图片轮播"><img v-if="items[current]" :src="items[current].src" :alt="items[current].alt" class="ds-image" /><p v-else>暂无图片</p><div class="ds-row"><Button variant="outline" :disabled="items.length < 2" @click="step(-1)">上一张</Button><span aria-live="polite">{{ items.length ? current+1 : 0 }} / {{ items.length }}</span><Button variant="outline" :disabled="items.length < 2" @click="step(1)">下一张</Button></div></section></template>
