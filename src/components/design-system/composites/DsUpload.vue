<script setup lang="ts">
import { ref } from 'vue'
import { Plus } from '@lucide/vue'
import { Button } from '../primitives/button'
withDefaults(defineProps<{ disabled?: boolean; busy?: boolean; error?: string; accept?: string; variant?: 'default' | 'tile'; label?: string; multiple?: boolean }>(), { accept: 'image/*', variant: 'default', label: '添加参考图片', multiple: true })
const emit = defineEmits<{ select: [files: File[]] }>()
const input = ref<HTMLInputElement>()
function selected(event: Event) { const el = event.target as HTMLInputElement; emit('select', Array.from(el.files || [])); el.value = '' }
</script>
<template><div :class="variant === 'tile' ? 'ds-upload-tile' : 'ds-upload ds-stack'"><p v-if="variant !== 'tile'" class="ds-heading">{{ label }}</p><p v-if="variant !== 'tile'" class="ds-caption">选择图片或拖入素材</p><input ref="input" class="sr-only" type="file" :multiple="multiple" :accept="accept" :disabled="disabled || busy" tabindex="-1" aria-label="选择参考图片" @change="selected" /><Button :class="{ 'ds-upload-trigger': variant === 'tile' }" variant="outline" :disabled="disabled || busy" @click="input?.click()"><Plus v-if="variant === 'tile'" />{{ busy ? '处理中…' : variant === 'tile' ? label : '选择 / 替换图片' }}</Button><p v-if="error" class="ds-error" role="alert">{{ error }}</p><slot /></div></template>
