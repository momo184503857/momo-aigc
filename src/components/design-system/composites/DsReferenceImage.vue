<script setup lang="ts">
import DsThumbnail from '@/components/design-system/composites/DsThumbnail.vue'
import { Trash2 } from '@lucide/vue'
import { Button } from '../primitives/button'
defineProps<{ src: string; label: string; dragging?: boolean }>()
defineEmits<{ preview: []; remove: [] }>()
</script>
<template><div class="ds-reference-image" :data-dragging="dragging"><Button variant="ghost" class="ds-reference-preview" :aria-label="`预览${label}`" @click="$emit('preview')"><DsThumbnail :src="src" :alt="label" draggable="false" /></Button><Button class="ds-reference-remove" variant="destructive" size="icon-xs" :aria-label="`删除${label}`" @click.stop="$emit('remove')"><Trash2 /></Button></div></template>
