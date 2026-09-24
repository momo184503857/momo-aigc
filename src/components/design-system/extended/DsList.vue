<script setup lang="ts">
defineProps<{ items: { id: string; title: string; description?: string }[]; loading?: boolean; emptyText?: string }>()
</script>
<template><div v-if="loading" role="status">加载中…</div><p v-else-if="!items.length" class="ds-muted">{{ emptyText || '暂无记录' }}</p><ul v-else class="ds-stack"><li v-for="item in items" :key="item.id" class="ds-detail-row"><div><h3 class="ds-heading">{{ item.title }}</h3><p class="ds-caption">{{ item.description }}</p></div><slot name="actions" :item="item" /></li></ul></template>
