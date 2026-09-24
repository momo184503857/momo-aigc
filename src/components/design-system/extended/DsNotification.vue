<script setup lang="ts">
import { Button } from '../primitives/button'
defineProps<{ title:string; description?:string; unread?:boolean; closable?:boolean }>()
defineEmits<{ close:[]; read:[] }>()
</script>
<template><article class="ds-panel ds-stack" aria-live="polite"><div class="ds-row"><h3 class="ds-heading">{{ title }}</h3><span v-if="unread" class="ds-caption">未读</span></div><p>{{ description }}</p><div class="ds-row"><Button v-if="unread" size="sm" variant="outline" @click="$emit('read')">标记已读</Button><Button v-if="closable" size="sm" variant="ghost" @click="$emit('close')">关闭</Button></div></article></template>
