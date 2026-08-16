<template>
  <div class="sg-expert-slot-form">
    <div v-for="slot in slots" :key="slot.key" class="slot-block">
      <div class="slot-label">
        {{ slot.label }}
        <span v-if="slot.required" class="req">必填</span>
        <span v-else class="opt">选填</span>
        <span class="max">最多 {{ slot.maxCount }} 张</span>
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

<style scoped>
.sg-expert-slot-form { display: flex; flex-direction: column; gap: var(--momo-space-4); }
.slot-block { display: flex; flex-direction: column; gap: var(--momo-space-2); }
.slot-label {
  font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary);
  display: flex; align-items: center; gap: var(--momo-space-2);
}
.req { color: var(--momo-color-danger); font-size: var(--momo-font-size-xs); }
.opt { color: var(--momo-color-text-tertiary); font-size: var(--momo-font-size-xs); }
.max { color: var(--momo-color-text-placeholder); font-size: var(--momo-font-size-xs); margin-left: auto; }
</style>
