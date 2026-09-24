<script setup lang="ts">
import { Button } from '../primitives/button'
defineProps<{ modelValue: number; items: { title: string; description?: string; disabled?: boolean }[] }>()
defineEmits<{ 'update:modelValue': [value: number]; change: [value: number] }>()
</script>
<template><nav aria-label="步骤"><ol class="ds-stack"><li v-for="(item,index) in items" :key="index" class="ds-row"><Button :variant="index === modelValue ? 'default' : 'outline'" :disabled="item.disabled" :aria-current="index === modelValue ? 'step' : undefined" @click="$emit('update:modelValue',index);$emit('change',index)">{{ index < modelValue ? '✓' : index+1 }} · {{ item.title }}</Button><p class="ds-caption">{{ item.description }}</p></li></ol></nav></template>
