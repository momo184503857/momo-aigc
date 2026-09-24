<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template><main class="ds-page"><header class="ds-row"><div class="ds-stack"><h1 class="ds-title">{{ title }}</h1><p v-if="description" class="ds-muted">{{ description }}</p></div><slot name="actions" /></header><slot name="filters" /><slot /><footer v-if="$slots.footer"><slot name="footer" /></footer></main></template>
