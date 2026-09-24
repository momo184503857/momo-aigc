<script setup lang="ts">
import { Button } from '../primitives/button'
withDefaults(defineProps<{ modelValue: number; max?: number; disabled?: boolean; label?: string }>(), { max: 5, label: '评分' })
defineEmits<{ 'update:modelValue': [value: number]; change: [value: number] }>()
</script>
<template><div class="ds-row" role="group" :aria-label="label"><Button v-for="n in max" :key="n" :variant="n <= modelValue ? 'default' : 'outline'" size="sm" :disabled="disabled" :aria-label="`${n} 星`" :aria-pressed="n === modelValue" @click="$emit('update:modelValue',n); $emit('change',n)">★</Button><span class="ds-caption">{{ modelValue }} / {{ max }}</span></div></template>
