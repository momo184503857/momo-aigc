<script setup lang="ts">
import { Button } from '../primitives/button'
const props=defineProps<{ target?:HTMLElement|null }>()
function top(event: MouseEvent){
 let container: HTMLElement | null = props.target || (event.currentTarget as HTMLElement).parentElement
 if(!props.target) while(container && !(container.scrollHeight > container.clientHeight && /auto|scroll/.test(getComputedStyle(container).overflowY))) container=container.parentElement
 ;(container || document.scrollingElement)?.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
}
</script>
<template><Button variant="outline" aria-label="回到顶部" @click="top">↑ 回到顶部</Button></template>
