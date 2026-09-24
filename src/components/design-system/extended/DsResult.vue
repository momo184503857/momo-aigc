<script setup lang="ts">
import { CircleCheck, CircleAlert, Info } from '@lucide/vue'
withDefaults(defineProps<{ title: string; description?: string; status?: 'success' | 'error' | 'info' }>(), { status: 'success' })
const icons = {success:CircleCheck,error:CircleAlert,info:Info}
</script>
<template><section class="ds-result" :role="status === 'error' ? 'alert' : 'status'"><component :is="icons[status]" class="ds-result-icon" /><h3 class="ds-heading">{{ title }}</h3><p class="ds-muted">{{ description }}</p><div class="ds-row"><slot name="actions" /></div><slot /></section></template>
