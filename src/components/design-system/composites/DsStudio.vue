<script setup lang="ts">
withDefaults(defineProps<{ title?: string }>(), {title:'创作工作台'})
</script>
<template><main class="ds-studio" :aria-label="title"><slot /></main></template>
