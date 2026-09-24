<script setup lang="ts">
import { useId } from 'vue'
import { Label } from '../primitives/label'
defineProps<{ label: string; help?: string; error?: string; required?: boolean }>()
const id = useId()
</script>
<template><div class="ds-stack"><Label :for="id">{{ label }}<span v-if="required" aria-hidden="true"> *</span></Label><slot :id="id" :describedby="`${id}-description`" :invalid="!!error" /><p :id="`${id}-description`" :class="error ? 'ds-error' : 'ds-caption'" :role="error ? 'alert' : undefined">{{ error || help }}</p></div></template>
