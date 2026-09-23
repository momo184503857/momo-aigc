<script setup lang="ts">
import { computed } from 'vue'
import { ImagePlus, Plus, X } from '@lucide/vue'
import type { Reference } from './model'

const props = defineProps<{
  slotConfig: { key: string; label: string; required: boolean; maxCount: number }
  references: Reference[]
  imageUrls: Record<string, string>
  disabled: boolean
}>()
const emit = defineEmits<{ upload: [files: FileList]; remove: [id: string] }>()
const images = computed(() => props.references.filter(r => r.slot === props.slotConfig.key))
function fileChanged(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) emit('upload', input.files)
  input.value = ''
}
</script>

<template>
  <div class="reference-section">
    <div class="field-heading">
      <label :for="`upload-${slotConfig.key}`">{{ slotConfig.label }}<span v-if="slotConfig.required" class="required-mark"> *</span></label>
      <span>{{ slotConfig.required ? '必需' : '可选' }}</span>
    </div>
    <div class="reference-items" :class="{ 'multiple-images': slotConfig.maxCount > 1 }">
      <div v-for="reference in images" :key="reference.id" class="reference-thumb">
        <img v-if="imageUrls[reference.id]" :src="imageUrls[reference.id]" :alt="reference.name" />
        <span v-else class="missing-reference">图片失效<br />请重新上传</span>
        <button type="button" :disabled="disabled" :aria-label="`移除${reference.name}`" class="remove-reference" @click="emit('remove', reference.id)"><X :size="14" /></button>
      </div>
      <label v-if="images.length < slotConfig.maxCount" :for="`upload-${slotConfig.key}`" class="upload-target">
        <input :id="`upload-${slotConfig.key}`" type="file" accept="image/jpeg,image/png,image/webp,image/gif" :multiple="slotConfig.maxCount > 1" :disabled="disabled" @change="fileChanged" />
        <span class="upload-icon"><ImagePlus v-if="!images.length" :size="25" :stroke-width="1.4" /><Plus v-else :size="24" /></span>
        <strong>添加{{ slotConfig.label }}</strong>
        <span>点击上传 · 最大 10MB</span>
      </label>
    </div>
  </div>
</template>
