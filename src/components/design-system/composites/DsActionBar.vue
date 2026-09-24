<script setup lang="ts">
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
withDefaults(defineProps<{ label?: string; busyLabel?: string; busy?: boolean; disabled?: boolean; reason?: string; reasonTone?: 'default' | 'error'; fullWidth?: boolean }>(), { label: '开始生成', reasonTone: 'default' })
defineEmits<{ submit: [] }>()
</script>
<template><div :class="['ds-footer', { 'ds-action-full': fullWidth }]"><p v-if="reason || $slots.default" class="ds-caption" :class="{ 'ds-error': reasonTone === 'error' }" role="status">{{ reason }}<slot /></p><Button :disabled="busy || disabled" @click="$emit('submit')"><Spinner v-if="busy" />{{ busy ? busyLabel || '处理中…' : label }}</Button></div></template>
