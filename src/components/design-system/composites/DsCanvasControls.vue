<script setup lang="ts">
import { Plus, Minus, Maximize } from '@lucide/vue'
import { Button } from '../primitives/button'
defineEmits<{ zoomIn: []; zoomOut: []; fit: [] }>()
</script>
<template><div class="ds-canvas-controls" role="group" aria-label="画布视图控制"><Button variant="outline" size="icon-sm" aria-label="放大画布" @click="$emit('zoomIn')"><Plus /></Button><Button variant="outline" size="icon-sm" aria-label="缩小画布" @click="$emit('zoomOut')"><Minus /></Button><Button variant="outline" size="icon-sm" aria-label="适配画布" @click="$emit('fit')"><Maximize /></Button></div></template>
