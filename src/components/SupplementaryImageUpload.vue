<script setup lang="ts">
/**
 * SupplementaryImageUpload - 补充图片上传组件
 * 支持最多5张补充图，每张可自定义命名（限制10个字）
 */
import { ref, computed } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'

defineOptions({ name: 'SupplementaryImageUpload' })

export interface SupplementaryImage {
  id: string
  dataUrl: string
  name: string
  sourceUrl?: string
  file?: File
}

const props = withDefaults(defineProps<{
  modelValue: SupplementaryImage[]
  maxCount?: number
}>(), {
  maxCount: 5,
})

const emit = defineEmits<{
  'update:modelValue': [images: SupplementaryImage[]]
}>()

const draggedIndex = ref<number | null>(null)
const isDragOver = ref(false)

const canAdd = computed(() => props.modelValue.length < props.maxCount)

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 限制命名长度为10个字
function handleNameChange(index: number, newName: string) {
  const updated = [...props.modelValue]
  updated[index] = { ...updated[index], name: newName.slice(0, 10) }
  emit('update:modelValue', updated)
}

// 添加图片
function handleAddImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/gif'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    let current = [...props.modelValue]
    for (const file of Array.from(input.files)) {
      if (current.length >= props.maxCount) break
      if (!file.type.startsWith('image/')) continue
      const dataUrl = await fileToDataUrl(file)
      current = [...current, {
        id: generateId(),
        dataUrl,
        name: '', // 不默认命名，让用户自己填写
        file,
      }]
    }
    emit('update:modelValue', current)
  }
  input.click()
}

// 删除图片
function handleRemove(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
}

// 拖拽排序
function handleDragStart(index: number) {
  draggedIndex.value = index
}

function handleDragOverItem(index: number) {
  if (draggedIndex.value === null || draggedIndex.value === index) return
  const items = [...props.modelValue]
  const [moved] = items.splice(draggedIndex.value, 1)
  items.splice(index, 0, moved)
  emit('update:modelValue', items)
  draggedIndex.value = index
}

function handleDragEnd() {
  draggedIndex.value = null
}

// 拖拽文件添加
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function handleDragEnter() {
  isDragOver.value = true
}

function handleDragLeave(e: DragEvent) {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as HTMLElement | null
  if (!related || !target.contains(related)) isDragOver.value = false
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    let current = [...props.modelValue]
    for (const file of Array.from(e.dataTransfer.files)) {
      if (current.length >= props.maxCount) break
      if (file.type.startsWith('image/')) {
        const dataUrl = await fileToDataUrl(file)
        current = [...current, { id: generateId(), dataUrl, name: '', file }] // 不默认命名
      }
    }
    emit('update:modelValue', current)
  }
}

// 预览
function showPreview(dataUrl: string) {
  window.open(dataUrl, '_blank')
}
</script>

<template>
  <div class="supplementary-upload">
    <div
      class="images-grid"
      :class="{ 'is-drag-over': isDragOver }"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div
        v-for="(img, index) in modelValue"
        :key="img.id"
        class="image-card"
        :class="{ 'is-dragging': draggedIndex === index }"
      >
        <div
          class="image-preview"
          draggable="true"
          @dragstart="handleDragStart(index)"
          @dragover.prevent="handleDragOverItem(index)"
          @dragend="handleDragEnd"
          @click="showPreview(img.dataUrl)"
        >
          <img :src="img.dataUrl" :alt="img.name" draggable="false" />
          <el-button
            class="remove-btn"
            type="danger"
            :icon="Delete"
            circle
            size="small"
            @click.stop="handleRemove(index)"
          />
        </div>
        <el-input
          :model-value="img.name"
          size="small"
          placeholder="图片命名"
          :maxlength="10"
          @update:model-value="handleNameChange(index, $event)"
        />
      </div>
      <div v-if="canAdd" class="add-btn" @click="handleAddImage">
        <el-icon size="28"><Plus /></el-icon>
        <span>添加图片</span>
      </div>
    </div>
    <p v-if="modelValue.length > 0" class="images-hint">可拖拽图片排序，命名限制10个字</p>
  </div>
</template>

<style scoped>
.supplementary-upload {
  margin-bottom: 14px;
}

.images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 120px;
  border-radius: var(--momo-radius-md);
  padding: 8px;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  border: 2px dashed transparent;
}

.images-grid.is-drag-over {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 4px var(--el-color-primary-light-5);
}

.image-card {
  width: 120px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: opacity 0.2s;
}

.image-card.is-dragging {
  opacity: 0.5;
}

.image-preview {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  border: 2px solid var(--el-border-color);
  transition: border-color 0.2s;
  cursor: grab;
}

.image-preview:hover {
  border-color: var(--el-color-primary);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
  pointer-events: none;
}

.remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-preview:hover .remove-btn {
  opacity: 1;
}

.add-btn {
  width: 120px;
  height: 120px;
  border: 2px dashed var(--el-border-color);
  border-radius: var(--momo-radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: border-color 0.2s, color 0.2s;
}

.add-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.add-btn span {
  font-size: var(--momo-font-size-sm);
  margin-top: 4px;
}

.images-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-top: 6px;
}
</style>
