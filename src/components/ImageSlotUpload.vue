<script setup lang="ts">
defineOptions({ name: 'ImageSlotUpload' })

export interface SlotImage {
  id: string
  dataUrl: string
  sourceUrl?: string
  file?: File
}

const props = withDefaults(defineProps<{
  label: string
  maxCount: number
  required: boolean
  modelValue: SlotImage[]
  showTemplateBtn?: boolean
  size?: number
  alignLeft?: boolean
}>(), { size: 200 })

const emit = defineEmits<{
  'update:modelValue': [images: SlotImage[]]
  'template-select': []
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
  <div class="slot-upload" :class="{ 'align-left': alignLeft }">
    <div
      class="slot-images"
      :class="{ 'align-left': alignLeft }"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <div v-for="(img, i) in modelValue" :key="img.id" class="slot-thumb-wrap" :style="{ width: size + 'px', height: size + 'px' }">
        <img :src="img.dataUrl" class="slot-thumb" @click="showPreview(img.dataUrl)" />
        <span class="slot-remove" @click="handleRemove(i)">&times;</span>
      </div>
      <label v-if="modelValue.length < maxCount" class="slot-add-btn" :style="{ width: size + 'px', height: size + 'px' }">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
          @change="handleFileInput" />
        <span class="add-icon">+</span>
        <span class="add-hint">点击上传</span>
      </label>
    </div>
    <div v-if="label" class="slot-label">
      <span v-if="required" class="required">*</span>
      {{ label }}
    </div>
    <el-button
      v-if="showTemplateBtn && modelValue.length < maxCount"
      size="small"
      class="template-btn"
      @click="emit('template-select')"
    >
      从模板库选择
    </el-button>
  </div>
</template>

<style scoped>
.slot-upload {
  margin-bottom: 14px;
  display: flex; flex-direction: column; align-items: center;
}

.slot-label {
  font-size: 14px; color: var(--el-text-color-secondary);
  margin-top: 8px; text-align: center;
}

.required { color: var(--el-color-danger); }

.slot-images {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
  align-items: flex-start;
}

.slot-thumb-wrap {
  position: relative; border-radius: 8px; overflow: hidden;
  border: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.slot-thumb {
  width: 100%; height: 100%; object-fit: cover; cursor: pointer;
}

.slot-remove {
  position: absolute; top: 6px; right: 6px;
  width: 24px; height: 24px; line-height: 22px; text-align: center;
  background: rgba(0,0,0,0.55); color: #fff; border-radius: 50%;
  font-size: 16px; cursor: pointer;
}

.slot-add-btn {
  border: 2px dashed var(--el-border-color-dark);
  border-radius: 8px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px;
  transition: border-color 0.2s, border-style 0.2s;
  flex-shrink: 0;
}
.slot-add-btn:hover { border-color: var(--el-color-primary); }
.add-icon { font-size: 36px; color: var(--el-text-color-placeholder); }
.add-hint { font-size: 13px; color: var(--el-text-color-placeholder); }

.template-btn {
  margin-top: 4px;
}

.align-left {
  align-items: flex-start;
}
.slot-images.align-left {
  justify-content: flex-start;
}
</style>
