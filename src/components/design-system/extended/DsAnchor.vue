<script setup lang="ts">
defineProps<{ items:{id:string;label:string}[] }>()
function jump(id:string){const el=document.getElementById(id);el?.scrollIntoView({block:'start'});el?.focus({preventScroll:true})}
</script>
<template><nav aria-label="内容目录" class="ds-stack"><a v-for="item in items" :key="item.id" :href="`#${item.id}`" class="ds-link" @click.prevent="jump(item.id)">{{ item.label }}</a></nav></template>
