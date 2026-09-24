<script setup lang="ts">
withDefaults(defineProps<{ href: string; disabled?: boolean; external?: boolean }>(), { disabled: false })
</script>
<template><a :href="disabled ? undefined : href" :aria-disabled="disabled || undefined" :tabindex="disabled ? -1 : undefined" :target="external ? '_blank' : undefined" :rel="external ? 'noopener noreferrer' : undefined" class="ds-link" @click="disabled && $event.preventDefault()"><slot /><span v-if="external" aria-hidden="true"> ↗</span></a></template>
