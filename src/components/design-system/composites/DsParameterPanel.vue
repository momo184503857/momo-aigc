<script setup lang="ts">
import DsActionBar from './DsActionBar.vue'
defineProps<{ label: string; disabled?: boolean; busy?: boolean; reason?: string }>()
defineEmits<{ submit: [] }>()
</script>
<template><section class="ds-panel ds-parameters" aria-label="参数区"><div class="ds-parameter-grid"><slot /></div><DsActionBar full-width :label="label" :busy="busy" :disabled="disabled" :reason="reason" @submit="$emit('submit')" /></section></template>
