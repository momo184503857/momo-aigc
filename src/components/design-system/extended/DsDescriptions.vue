<script setup lang="ts">
defineProps<{ items: { label: string; value: string | number }[] }>()
</script>
<template><dl class="ds-stack"><div v-for="item in items" :key="item.label" class="ds-detail-row"><dt class="ds-muted">{{ item.label }}</dt><dd><slot name="value" :item="item">{{ item.value }}</slot></dd></div></dl></template>
