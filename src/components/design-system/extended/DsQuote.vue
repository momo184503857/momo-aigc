<script setup lang="ts">
defineProps<{ author?: string }>()
</script>
<template><figure class="ds-quote"><blockquote><slot /></blockquote><figcaption v-if="author" class="ds-caption">— {{ author }}</figcaption></figure></template>
