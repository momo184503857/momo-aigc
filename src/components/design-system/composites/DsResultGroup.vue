<script setup lang="ts">
defineProps<{ label: string; compact?: boolean }>()
</script>
<template><article class="ds-result-group"><time class="ds-caption">{{ label }}</time><div class="ds-result-strip" :class="{ 'ds-result-strip-compact': compact }" tabindex="0" :aria-label="`${label} 提交的图片，可左右滚动`"><slot /></div></article></template>
