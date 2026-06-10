<script setup lang="ts">
import { ref } from 'vue'
defineOptions({ name: 'ImageSlotUpload' })

export interface SlotImage {
  id: string
  dataUrl: string
  sourceUrl?: string
  file?: File
}

export interface StarredTemplate {
  id: number
  name: string
  public_url: string
}

const props = withDefaults(defineProps<{
  label: string
  maxCount: number
  required: boolean
  modelValue: SlotImage[]
  showTemplateBtn?: boolean
  size?: number
  alignLeft?: boolean
  starredTemplates?: StarredTemplate[]
}>(), { size: 200, starredTemplates: () => [] })

const emit = defineEmits<{
  'update:modelValue': [images: SlotImage[]]
  'template-select': []
  'starred-select': [template: StarredTemplate]
}>()

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function addFromFiles(fileList: FileList | File[]) {
  const files = Array.from(fileList)
  let current = [...props.modelValue]
  for (const file of files) {
    if (current.length >= props.maxCount) break
    if (!file.type.startsWith('image/')) continue
    const dataUrl = await readFileAsDataUrl(file)
    const img: SlotImage = {
      id: generateId(),
      dataUrl,
      file,
    }
    current = [...current, img]
    emit('update:modelValue', current)
  }
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFromFiles(input.files)
  input.value = ''
}

function handleFileReplace(index: number) {
  return (e: Event) => {
    const input = e.target as HTMLInputElement
    if (!input.files?.length) return
    const file = input.files[0]
    if (!file.type.startsWith('image/')) return
    readFileAsDataUrl(file).then(dataUrl => {
      const replaced = [...props.modelValue]
      replaced[index] = {
        ...replaced[index],
        dataUrl,
        file,
      }
      emit('update:modelValue', replaced)
    })
    input.value = ''
  }
}

function handleDrop(e: DragEvent) {
  // Files from OS
  if (e.dataTransfer?.files.length) {
    addFromFiles(e.dataTransfer.files)
    return
  }
  // URL or data URL dragged from task list / browser
  const text = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('text/uri-list')
  if (!text) return
  const url = text.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) return
  const remaining = props.maxCount - props.modelValue.length
  if (remaining <= 0) return
  const img: SlotImage = {
    id: generateId(),
    dataUrl: url,
    sourceUrl: url.startsWith('http') ? url : undefined,
  }
  emit('update:modelValue', [...props.modelValue, img])
}

function handleRemove(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
}

const previewUrl = ref<string>('')
const showPreviewDialog = ref(false)

function showPreview(dataUrl: string) {
  previewUrl.value = dataUrl
  showPreviewDialog.value = true
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
        <span class="slot-remove" @click.stop="handleRemove(i)">&times;</span>
        <!-- Replace button overlay on bottom-right of image -->
        <label class="slot-replace-btn" @click.stop>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            @change="handleFileReplace(i)" />
          <span class="replace-icon">⟳</span>
        </label>
      </div>
      <!-- Add button: visible when slot is not yet filled -->
      <label v-if="modelValue.length < maxCount" class="slot-add-btn" :style="{ width: size + 'px', height: size + 'px' }">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
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
      v-if="showTemplateBtn"
      size="small"
      class="template-btn"
      @click="emit('template-select')"
    >
      从模板库选择
    </el-button>
    <div
      v-if="showTemplateBtn && starredTemplates.length > 0"
      class="starred-row"
    >
      <div
        v-for="t in starredTemplates"
        :key="t.id"
        class="starred-thumb"
        :title="t.name"
        @click="emit('starred-select', t)"
      >
        <img :src="t.public_url" :alt="t.name" />
      </div>
    </div>
  </div>

  <!-- Preview dialog -->
  <el-dialog v-model="showPreviewDialog" :show-close="true" width="80%" align-center>
    <img :src="previewUrl" class="preview-img" />
  </el-dialog>
</template>

<style scoped>
.slot-upload {
  margin-bottom: 14px;
  display: flex; flex-direction: column; align-items: center;
}

.slot-label {
  font-size: var(--momo-font-size-base); color: var(--el-text-color-secondary);
  margin-top: 8px; text-align: center;
}

.required { color: var(--el-color-danger); }

.slot-images {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
  align-items: flex-start;
}

.slot-thumb-wrap {
  position: relative; border-radius: var(--momo-radius-md); overflow: hidden;
  border: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.slot-thumb {
  width: 100%; height: 100%; object-fit: cover; cursor: pointer;
}

.slot-remove {
  position: absolute; top: 6px; right: 6px;
  width: 22px; height: 22px; line-height: 20px; text-align: center;
  background: var(--el-color-danger); color: var(--momo-color-text-inverse); border-radius: 50%;
  font-size: var(--momo-font-size-base); cursor: pointer;
  z-index: 2;
}
.slot-remove:hover { background: var(--el-color-danger-dark); }

.slot-replace-btn {
  position: absolute; bottom: 6px; right: 6px;
  width: 22px; height: 22px;
  background: var(--el-color-primary); color: var(--momo-color-text-inverse);
  border-radius: 50%; cursor: pointer; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s, transform 0.15s;
}
.slot-replace-btn:hover { background: var(--el-color-primary-dark); transform: scale(1.1); }
.replace-icon { font-size: 14px; line-height: 1; }

.slot-add-btn {
  border: 2px dashed var(--el-border-color-dark);
  border-radius: var(--momo-radius-md); cursor: pointer;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px;
  transition: border-color 0.2s, border-style 0.2s;
  flex-shrink: 0;
}
.slot-add-btn:hover { border-color: var(--el-color-primary); }
.add-icon { font-size: 36px; color: var(--el-text-color-placeholder); }
.add-hint { font-size: var(--momo-font-size-sm); color: var(--el-text-color-placeholder); }

.template-btn {
  margin-top: 4px;
}

.starred-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  max-width: 100%;
  overflow-x: auto;
  padding: 4px 0;
}
.starred-row::-webkit-scrollbar {
  height: 4px;
}
.starred-row::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 2px;
}
.starred-thumb {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 2px solid var(--el-border-color-light);
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
}
.starred-thumb:hover {
  border-color: var(--el-color-primary);
  transform: scale(1.08);
}
.starred-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.align-left {
  align-items: flex-start;
}
.slot-images.align-left {
  justify-content: flex-start;
}

.preview-img {
  width: 100%;
  max-height: 80vh;
  object-fit: contain;
  display: block;
}
</style>
