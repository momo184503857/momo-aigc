<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template><article class="ds-result-group"><time class="ds-caption">{{ label }}</time><div class="ds-result-strip" tabindex="0" :aria-label="`${label} 提交的图片，可左右滚动`"><slot /></div></article></template>
