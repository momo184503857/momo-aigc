<script setup lang="ts">
/**
 * GenerationForm - 生图参数表单
 * 从 ToolFlux 复制并改造：去掉 ChannelId/Electron/提示词库，接入 Web API
 */
import { ref, computed } from 'vue'
import { Plus, Delete, Picture } from '@element-plus/icons-vue'
import type { ModelId } from '@/types/adapter'
import { MODELS, DEFAULT_MODEL, DEFAULT_RESOLUTION, DEFAULT_ASPECT_RATIO } from '@/types/adapter'
import { useKeyConfigStore } from '@/stores/keyConfig'
import TemplateSelector from './TemplateSelector.vue'

const emit = defineEmits<{
  (e: 'generate', params: {
    modelId: ModelId
    prompt: string
    resolution: string
    aspectRatio: string
    count: number
    templateUrls: string[]
    tempImageFiles: File[]
  }): void
}>()

const keyStore = useKeyConfigStore()

const selectedModelId = ref<ModelId>(DEFAULT_MODEL)
const prompt = ref('')
const resolution = ref(DEFAULT_RESOLUTION)
const aspectRatio = ref(DEFAULT_ASPECT_RATIO)
const count = ref(1)
const showTemplateSelector = ref(false)

// Reference images: { id, dataUrl, label, sourceUrl? }
// sourceUrl = OSS public URL (for templates), undefined = temp file
interface RefImage {
  id: string
  dataUrl: string
  label: string
  sourceUrl?: string
}

const referenceImages = ref<RefImage[]>([])

const draggedIndex = ref<number | null>(null)

const selectedModel = computed(() => MODELS.find((m) => m.id === selectedModelId.value))

const availableResolutions = computed(() => selectedModel.value?.resolutions || ['1K'])

const availableAspectRatios = computed(() => selectedModel.value?.aspectRatios || ['1:1'])

const canAddImage = computed(() => referenceImages.value.length < 9)
const canGenerate = computed(() => prompt.value.trim().length > 0 && keyStore.hasKey)

// Model change: reset resolution/aspect to valid values
function handleModelChange() {
  const model = selectedModel.value
  if (model) {
    if (!model.resolutions.includes(resolution.value)) {
      resolution.value = model.resolutions[0]
    }
    if (!model.aspectRatios.includes(aspectRatio.value)) {
      aspectRatio.value = model.aspectRatios[0]
    }
  }
}

// Add from file picker
function handleAddImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/gif'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    for (const file of Array.from(input.files)) {
      if (!canAddImage.value) break
      const dataUrl = await fileToDataUrl(file)
      referenceImages.value.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        dataUrl,
        label: file.name,
      })
    }
  }
  input.click()
}

// Delete
function handleRemoveImage(index: number) {
  referenceImages.value.splice(index, 1)
}

// Drag sort
function handleDragStart(index: number) { draggedIndex.value = index }
function handleDragOverItem(index: number) {
  if (draggedIndex.value === null || draggedIndex.value === index) return
  const items = [...referenceImages.value]
  const [moved] = items.splice(draggedIndex.value, 1)
  items.splice(index, 0, moved)
  referenceImages.value = items
  draggedIndex.value = index
}
function handleDragEnd() { draggedIndex.value = null }

// Template selection
function handleTemplateSelect(templates: Array<{ name: string; url: string; previewUrl?: string }>) {
  for (const t of templates) {
    if (!canAddImage.value) break
    referenceImages.value.push({
      id: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dataUrl: t.previewUrl || t.url,
      label: t.name || '模板图',
      sourceUrl: t.url,
    })
  }
}

// File → dataUrl
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Drag-and-drop
const isDragOver = ref(false)
function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    for (const file of Array.from(e.dataTransfer.files)) {
      if (!canAddImage.value) break
      if (file.type.startsWith('image/')) {
        fileToDataUrl(file).then((dataUrl) => {
          referenceImages.value.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            dataUrl,
            label: file.name,
          })
        })
      }
    }
    return
  }
  const dataUrl = e.dataTransfer?.getData('text/plain')
  if (dataUrl?.startsWith('data:image/')) {
    if (!canAddImage.value) return
    referenceImages.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dataUrl,
      label: `图片${referenceImages.value.length + 1}`,
    })
  }
}
function handleDragOver(e: DragEvent) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' }
function handleDragEnter() { isDragOver.value = true }
function handleDragLeave(e: DragEvent) {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as HTMLElement | null
  if (!related || !target.contains(related)) isDragOver.value = false
}

// Generate
function handleGenerate() {
  if (!canGenerate.value) return
  const templateUrls = referenceImages.value.filter((r) => r.sourceUrl).map((r) => r.sourceUrl!)
  const tempImageFiles = referenceImages.value
    .filter((r) => !r.sourceUrl)
    .map((r) => dataUrlToFile(r.dataUrl, r.label))

  emit('generate', {
    modelId: selectedModelId.value,
    prompt: prompt.value.trim(),
    resolution: resolution.value,
    aspectRatio: aspectRatio.value,
    count: count.value,
    templateUrls,
    tempImageFiles,
  })
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',')
  const mime = arr[0].match(/:(.*?);/)![1]
  const bstr = atob(arr[1])
  const n = bstr.length
  const u8arr = new Uint8Array(n)
  for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i)
  return new File([u8arr], filename, { type: mime })
}

// External setParams
function setParams(params: {
  modelId: ModelId
  prompt: string
  resolution: string
  aspectRatio: string
  referenceImages?: { dataUrl: string; sourceUrl?: string }[]
}) {
  selectedModelId.value = params.modelId
  prompt.value = params.prompt
  resolution.value = params.resolution
  aspectRatio.value = params.aspectRatio
  if (params.referenceImages && params.referenceImages.length > 0) {
    referenceImages.value = params.referenceImages.map((img, i) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`,
      dataUrl: img.dataUrl,
      label: `参考图${i + 1}`,
      sourceUrl: img.sourceUrl,
    }))
  }
}

defineExpose({ setParams })
</script>

<template>
  <div class="generation-form">
    <h3 class="section-title">生成参数</h3>

    <!-- Key missing warning -->
    <el-alert
      v-if="!keyStore.hasKey"
      title="请先在 API Key 设置页填写你的 ToAPIs API Key，才能提交生图任务"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <!-- Model -->
    <div class="form-item">
      <label class="form-label">模型</label>
      <el-select v-model="selectedModelId" style="width: 100%" @change="handleModelChange">
        <el-option v-for="m in MODELS" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
    </div>

    <!-- Reference Images -->
    <div class="form-item">
      <label class="form-label">参考图片（可选，最多9张）</label>
      <div
        class="images-container"
        :class="{ 'is-drag-over': isDragOver }"
        @dragover="handleDragOver"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div
          v-for="(img, index) in referenceImages"
          :key="img.id"
          class="image-item"
          :class="{ 'is-dragging': draggedIndex === index }"
          draggable="true"
          @dragstart="handleDragStart(index)"
          @dragover.prevent="handleDragOverItem(index)"
          @dragend="handleDragEnd"
        >
          <img :src="img.dataUrl" :alt="img.label" draggable="false" />
          <el-tag v-if="img.sourceUrl" size="small" class="template-tag" type="success">模板</el-tag>
          <el-button
            class="remove-btn"
            type="danger"
            :icon="Delete"
            circle
            size="small"
            @click="handleRemoveImage(index)"
          />
        </div>
        <div v-if="canAddImage" class="add-image-btn" @click="handleAddImage">
          <el-icon size="24"><Plus /></el-icon>
          <span>添加图片</span>
        </div>
      </div>
      <p v-if="referenceImages.length > 0" class="image-hint">可拖拽排序</p>
      <el-button
        size="small"
        :icon="Picture"
        @click="showTemplateSelector = true"
        :disabled="!canAddImage"
        style="margin-top: 8px"
      >
        从模板库选择
      </el-button>
    </div>

    <!-- Template Selector Dialog -->
    <TemplateSelector
      v-model:visible="showTemplateSelector"
      @select="handleTemplateSelect"
    />

    <!-- Prompt -->
    <div class="form-item">
      <label class="form-label">提示词 <span class="required">*</span></label>
      <el-input
        v-model="prompt"
        type="textarea"
        :rows="4"
        placeholder="描述你想要生成的图片..."
      />
    </div>

    <!-- Resolution + Aspect Ratio -->
    <div class="form-row">
      <div class="form-item form-item-half">
        <label class="form-label">分辨率</label>
        <el-radio-group v-model="resolution">
          <el-radio-button v-for="r in availableResolutions" :key="r" :value="r">
            {{ r }}
          </el-radio-button>
        </el-radio-group>
      </div>
      <div class="form-item form-item-half">
        <label class="form-label">宽高比</label>
        <el-select v-model="aspectRatio" style="width: 100%">
          <el-option v-for="ar in availableAspectRatios" :key="ar" :label="ar" :value="ar" />
        </el-select>
      </div>
    </div>

    <!-- Count -->
    <div class="form-item">
      <label class="form-label">生成数量</label>
      <el-select v-model="count" style="width: 100%">
        <el-option v-for="n in [1, 2, 3, 4, 5]" :key="n" :label="`${n}张`" :value="n" />
      </el-select>
    </div>

    <!-- Submit -->
    <el-button
      type="primary"
      size="large"
      :disabled="!canGenerate"
      style="width: 100%; margin-top: 8px"
      @click="handleGenerate"
    >
      生成图片
    </el-button>
  </div>
</template>

<style scoped>
.section-title {
  font-size: var(--el-font-size-medium);
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 12px 0;
}
.form-item { margin-bottom: 16px; }
.form-label {
  display: block;
  font-size: var(--el-font-size-base);
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}
.required { color: var(--el-color-danger); }

.images-container {
  display: flex; flex-wrap: wrap; gap: 8px;
  min-height: 80px; border-radius: 8px; padding: 4px;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  border: 2px dashed transparent;
}
.images-container.is-drag-over {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 4px var(--el-color-primary-light-5);
}
.image-item {
  position: relative; width: 72px; height: 72px;
  border-radius: 8px; overflow: hidden;
  border: 2px solid var(--el-border-color);
  cursor: grab;
  transition: border-color 0.2s, opacity 0.2s;
}
.image-item:hover { border-color: var(--el-color-primary); }
.image-item.is-dragging { opacity: 0.5; border-color: var(--el-color-primary); }
.image-item img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }

.template-tag {
  position: absolute; bottom: 2px; left: 2px; font-size: 10px;
}

.remove-btn {
  position: absolute; top: 2px; right: 2px;
  opacity: 0; transition: opacity 0.2s;
}
.image-item:hover .remove-btn { opacity: 1; }

.add-image-btn {
  width: 72px; height: 72px;
  border: 2px dashed var(--el-border-color); border-radius: 8px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  cursor: pointer; color: var(--el-text-color-secondary);
  transition: border-color 0.2s, color 0.2s;
}
.add-image-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.add-image-btn span { font-size: 11px; margin-top: 4px; }

.image-hint {
  font-size: 11px; color: var(--el-text-color-placeholder); margin: 6px 0;
}

.form-row { display: flex; gap: 12px; }
.form-item-half { flex: 1; min-width: 0; }
</style>
