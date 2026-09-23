<template>
  <div class="flex flex-col gap-4">
    <div v-for="slot in slots" :key="slot.key" class="flex flex-col gap-2">
      <div class="flex items-center gap-2 text-sm text-(--momo-color-text-secondary)">
        {{ slot.label }}
        <span v-if="slot.required" class="text-destructive text-xs">必填</span>
        <span v-else class="text-muted-foreground text-xs">选填</span>
        <span class="ml-auto text-xs text-(--momo-color-text-placeholder)">最多 {{ slot.maxCount }} 张</span>
      </div>
      <ImageSlotUpload
        :label="slot.label"
        :max-count="slot.maxCount"
        :required="slot.required"
        :model-value="imagesBySlot[slot.key] || []"
        :size="130"
        @update:model-value="(imgs) => onSlot(slot.key, imgs)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ImageSlotUpload, { type SlotImage } from '@/components/ImageSlotUpload.vue'

defineOptions({ name: 'SgExpertSlotForm' })

export interface ExpertSlotDef {
  key: string
  label: string
  maxCount: number
  required: boolean
}

const props = defineProps<{
  slots: ExpertSlotDef[]
  modelValue: Record<string, SlotImage[]>
}>()

const emit = defineEmits<{ 'update:modelValue': [v: Record<string, SlotImage[]>] }>()

const imagesBySlot = computed(() => props.modelValue)

function onSlot(key: string, imgs: SlotImage[]) {
  emit('update:modelValue', { ...props.modelValue, [key]: imgs })
}

function validate(): string | null {
  for (const s of props.slots) {
    if (s.required && (props.modelValue[s.key]?.length ?? 0) === 0) {
      return `请上传「${s.label}」`
    }
  }
  return null
}

defineExpose({ validate })
</script>
