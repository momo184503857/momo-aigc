<script setup lang="ts">
import {computed} from 'vue'
import {Button} from '../primitives/button'
const props=withDefaults(defineProps<{ title:string; items:{label:string;value:number}[]; type?:'bar'|'line'; loading?:boolean; error?:string }>(),{type:'bar'})
defineEmits<{ retry:[] }>()
const maximum=computed(()=>Math.max(1,...props.items.map(i=>Math.abs(i.value))))
const points=computed(()=>props.items.map((i,n)=>`${20+n*260/Math.max(1,props.items.length-1)},${110-i.value/maximum.value*90}`).join(' '))
</script>
<template><figure class="ds-stack"><figcaption class="ds-heading">{{ title }}</figcaption><p v-if="loading" role="status">图表加载中…</p><div v-else-if="error" role="alert">{{ error }}<Button variant="outline" @click="$emit('retry')">重试</Button></div><p v-else-if="!items.length">暂无图表数据</p><template v-else><svg v-if="type==='line'" viewBox="0 0 300 220" role="img" :aria-label="title" class="ds-line-chart"><polyline :points="points" /></svg><dl class="ds-stack"><div v-for="item in items" :key="item.label"><div class="ds-detail-row"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div><div v-if="type==='bar'" class="ds-chart-track"><div :style="{width:`${Math.abs(item.value)/maximum*100}%`}" /></div></div></dl></template></figure></template>
