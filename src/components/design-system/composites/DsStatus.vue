<script setup lang="ts">
import { Badge } from '../primitives/badge'
import { LoaderCircle, CircleCheck, CircleAlert, Clock, Ban } from '@lucide/vue'
withDefaults(defineProps<{ status?: 'pending' | 'running' | 'done' | 'failed' | 'cancelled' }>(), { status: 'pending' })
const labels = { pending: '等待处理', running: '生成中', done: '已完成', failed: '失败', cancelled: '已取消' }
const icons = { pending: Clock, running: LoaderCircle, done: CircleCheck, failed: CircleAlert, cancelled: Ban }
</script>
<template><Badge variant="outline"><component :is="icons[status]" :class="status === 'running' ? 'animate-spin size-3' : 'size-3'" />{{ labels[status] }}</Badge></template>
