<script setup lang="ts">
withDefaults(defineProps<{ markOnly?: boolean }>(), { markOnly: false })
</script>

<template>
  <span class="ds-brand-logo" aria-label="墨墨">
    <svg class="ds-brand-mark" viewBox="0 0 40 34" fill="none" aria-hidden="true">
      <path d="M5 28 12.5 6 20 24 27.5 6 35 28" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="!markOnly" class="ds-brand-wordmark" aria-hidden="true">墨墨</span>
  </span>
</template>
