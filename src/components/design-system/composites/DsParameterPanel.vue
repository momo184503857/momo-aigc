<script setup lang="ts">
import DsActionBar from './DsActionBar.vue'
defineProps<{ label: string; busyLabel?: string; disabled?: boolean; busy?: boolean; reason?: string; reasonTone?: 'default' | 'error' }>()
defineEmits<{ submit: [] }>()
</script>
<template><section class="ds-panel ds-parameters" aria-label="参数区"><div class="ds-parameter-grid"><slot /></div><DsActionBar full-width :label="label" :busy-label="busyLabel" :busy="busy" :disabled="disabled" :reason="reason" :reason-tone="reasonTone" @submit="$emit('submit')" /><div v-if="$slots.after" class="ds-parameter-after"><slot name="after" /></div></section></template>
