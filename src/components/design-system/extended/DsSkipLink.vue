<script setup lang="ts">
defineProps<{ targetId:string }>()
function skip(id:string){document.getElementById(id)?.focus();document.getElementById(id)?.scrollIntoView()}
</script>
<template><a class="ds-skip-link" :href="`#${targetId}`" @click.prevent="skip(targetId)">跳过导航，进入内容</a></template>
