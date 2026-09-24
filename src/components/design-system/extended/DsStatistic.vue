<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ title: string; value: number; precision?: number; suffix?: string; loading?: boolean }>(), { precision: 0 })
const formatted = computed(() => Number.isFinite(props.value) ? props.value.toLocaleString('zh-CN', { minimumFractionDigits: Math.min(20, Math.max(0, props.precision)), maximumFractionDigits: Math.min(20, Math.max(0, props.precision)) }) : '—')
</script>
<template><div class="ds-stack"><p class="ds-muted">{{ title }}</p><p class="ds-title" :aria-busy="loading">{{ loading ? '加载中…' : formatted }} <small class="ds-caption">{{ suffix }}</small></p><slot /></div></template>
