<script setup lang="ts">
import { File } from '@lucide/vue'
import { Button } from '../primitives/button'
defineProps<{ name: string; size?: number; status?: string; removable?: boolean; disabled?: boolean }>()
defineEmits<{ remove: []; open: [] }>()
</script>
<template><div class="ds-detail-row"><div class="ds-row"><File aria-hidden="true" class="size-4" /><div><p class="ds-heading">{{ name }}</p><p class="ds-caption">{{ size == null ? '' : `${(size/1024).toFixed(1)} KB` }} {{ status }}</p></div></div><div class="ds-row"><Button variant="outline" size="sm" :disabled="disabled" @click="$emit('open')">查看</Button><Button v-if="removable" variant="destructive" size="sm" :disabled="disabled" @click="$emit('remove')">移除</Button></div></div></template>
