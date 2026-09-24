<script setup lang="ts">
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
withDefaults(defineProps<{ label?: string; busy?: boolean; disabled?: boolean; reason?: string; fullWidth?: boolean }>(), { label: '开始生成' })
defineEmits<{ submit: [] }>()
</script>
<template><div :class="['ds-footer', { 'ds-action-full': fullWidth }]"><p v-if="reason || $slots.default" class="ds-caption" role="status">{{ reason }}<slot /></p><Button :disabled="busy || disabled" @click="$emit('submit')"><Spinner v-if="busy" />{{ busy ? '处理中…' : label }}</Button></div></template>
