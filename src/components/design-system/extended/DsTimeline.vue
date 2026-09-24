<script setup lang="ts">
defineProps<{ items: { id: string; title: string; time?: string; description?: string; status?: string }[] }>()
</script>
<template><ol class="ds-timeline"><li v-for="item in items" :key="item.id" class="ds-stack"><div class="ds-row"><strong>{{ item.title }}</strong><span v-if="item.status" class="ds-caption">{{ item.status }}</span></div><time v-if="item.time" class="ds-caption">{{ item.time }}</time><p v-if="item.description">{{ item.description }}</p><slot :item="item" /></li></ol></template>
