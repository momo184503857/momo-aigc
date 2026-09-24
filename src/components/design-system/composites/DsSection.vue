<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template><section class="ds-panel ds-stack"><header class="ds-stack"><div class="ds-detail-heading"><h2 class="ds-heading">{{ title }}</h2><slot name="actions" /></div><p v-if="description" class="ds-caption">{{ description }}</p></header><slot /><footer v-if="$slots.footer" class="ds-footer"><slot name="footer" /></footer></section></template>
