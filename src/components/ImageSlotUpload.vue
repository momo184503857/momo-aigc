<script setup lang="ts">
defineOptions({ name: 'ImageSlotUpload' })

export interface SlotImage {
  id: string
  dataUrl: string
  sourceUrl?: string
  file?: File
}

const props = defineProps<{
  label: string
  maxCount: number
  required: boolean
  modelValue: SlotImage[]
}>()

const emit = defineEmits<{
  'update:modelValue': [images: SlotImage[]]
}>()

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function addFromFiles(files: FileList) {
  const remaining = props.maxCount - props.modelValue.length
  if (remaining <= 0) return
  const toAdd = Math.min(remaining, files.length)
  const newImages: SlotImage[] = []
  for (let i = 0; i < toAdd; i++) {
    const file = files[i]
    if (!file.type.startsWith('image/')) continue
    const reader = new FileReader()
    reader.onload = () => {
      const img: SlotImage = {
        id: generateId(),
        dataUrl: reader.result as string,
        file,
      }
      const updated = [...props.modelValue, img]
      if (updated.length <= props.maxCount) {
        emit('update:modelValue', updated)
      }
    }
    reader.readAsDataURL(file)
  }
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFromFiles(input.files)
  input.value = ''
}

function handleDrop(e: DragEvent) {
  if (e.dataTransfer?.files.length) addFromFiles(e.dataTransfer.files)
}

function handleRemove(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
}

function showPreview(dataUrl: string) {
  window.open(dataUrl, '_blank')
}
</script>

<template>
  <div class="slot-upload">
    <div class="slot-label">
      <span v-if="required" class="required">*</span>
      {{ label }}
      <span class="limit-hint">{{ modelValue.length }}/{{ maxCount }}</span>
    </div>
    <div
      class="slot-images"
      :class="{ 'drag-over': false }"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <div v-for="(img, i) in modelValue" :key="img.id" class="slot-thumb-wrap">
        <img :src="img.dataUrl" class="slot-thumb" @click="showPreview(img.dataUrl)" />
        <span class="slot-remove" @click="handleRemove(i)">&times;</span>
      </div>
      <label v-if="modelValue.length < maxCount" class="slot-add-btn">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
          @change="handleFileInput" />
        <span class="add-icon">+</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.slot-upload {
  margin-bottom: 14px;
}

.slot-label {
  font-size: 13px; color: var(--el-text-color-regular);
  margin-bottom: 8px; display: flex; align-items: center; gap: 4px;
}

.required { color: var(--el-color-danger); }

.limit-hint {
  margin-left: auto; font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.slot-images {
  display: flex; flex-wrap: wrap; gap: 8px;
  min-height: 56px; align-items: flex-start;
}

.slot-thumb-wrap {
  position: relative; width: 80px; height: 80px;
  border-radius: 6px; overflow: hidden;
  border: 1px solid var(--el-border-color);
}

.slot-thumb {
  width: 100%; height: 100%; object-fit: cover; cursor: pointer;
}

.slot-remove {
  position: absolute; top: 2px; right: 2px;
  width: 18px; height: 18px; line-height: 16px; text-align: center;
  background: rgba(0,0,0,0.55); color: #fff; border-radius: 50%;
  font-size: 14px; cursor: pointer;
}

.slot-add-btn {
  width: 80px; height: 80px;
  border: 1px dashed var(--el-border-color-dark);
  border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.2s;
}
.slot-add-btn:hover { border-color: var(--el-color-primary); }
.add-icon { font-size: 24px; color: var(--el-text-color-placeholder); }
</style>
