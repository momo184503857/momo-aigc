<script setup lang="ts">
import DsStatus from './DsStatus.vue'
defineProps<{ title: string; status?: 'pending' | 'running' | 'done' | 'failed' | 'cancelled' }>()
</script>
<template><section class="ds-panel ds-stack ds-node"><h3 class="ds-heading">{{ title }}</h3><DsStatus :status="status" /><div class="ds-row"><span aria-label="图片输入端口">○ 图片输入</span><span aria-label="文本输出端口">文本输出 ○</span></div><slot /></section></template>
