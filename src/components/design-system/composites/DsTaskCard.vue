<script setup lang="ts">
import DsStatus from './DsStatus.vue'
import { Button } from '../primitives/button'
import { Progress } from '../primitives/progress'
defineProps<{ title: string; status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'; progress?: number; error?: string }>()
defineEmits<{ retry: []; reuse: [] }>()
</script>
<template><article class="ds-panel ds-stack"><div class="ds-row"><h3 class="ds-heading">{{ title }}</h3><DsStatus :status="status" /></div><slot /><Progress v-if="status === 'running'" :model-value="progress" aria-label="生成进度" /><p v-if="error" class="ds-error" role="alert">{{ error }}</p><Button v-if="status === 'failed'" variant="outline" @click="$emit('retry')">重试</Button><Button v-if="status === 'done'" variant="outline" @click="$emit('reuse')">复用参数</Button></article></template>
