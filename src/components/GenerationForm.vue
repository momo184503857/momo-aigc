<script setup lang="ts">
/**
 * GenerationForm - 生图参数表单
 * 从 ToolFlux 复制并改造：去掉 ChannelId/Electron/提示词库，接入 Web API
 */
import { ref, computed } from 'vue'
import { Plus, Delete, Picture, Collection } from '@element-plus/icons-vue'
import type { ModelId } from '@/types/adapter'
import { MODELS, DEFAULT_MODEL, DEFAULT_RESOLUTION, DEFAULT_ASPECT_RATIO, getAspectRatios, getPrice } from '@/types/adapter'
import { useServerStatusStore } from '@/stores/serverStatus'
import { promptLibraryApi } from '@/services/promptLibraryApi'
import type { PromptLibraryItem } from '@/services/promptLibraryApi'
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
    refImages?: Array<{ url?: string; file?: File }>
  }): void
}>()

const serverStatus = useServerStatusStore()

const selectedModelId = ref<ModelId>(DEFAULT_MODEL)
const prompt = ref('')
const resolution = ref(DEFAULT_RESOLUTION)
const aspectRatio = ref(DEFAULT_ASPECT_RATIO)
const count = ref(1)
const showTemplateSelector = ref(false)
const previewVisible = ref(false)
const previewImageUrl = ref('')

function openPreview(url: string) {
  previewImageUrl.value = url
  previewVisible.value = true
}

// Prompt library selector
const showPromptLibrary = ref(false)
const promptLibraryItems = ref<PromptLibraryItem[]>([])
const promptLibraryLoading = ref(false)
const promptLibraryActiveTag = ref<string | undefined>(undefined)

const promptLibraryFiltered = computed(() => {
  if (!promptLibraryActiveTag.value) return promptLibraryItems.value
  return promptLibraryItems.value.filter((item) => item.tags.includes(promptLibraryActiveTag.value!))
})

const promptLibraryAllTags = computed(() => {
  const tagSet = new Set<string>()
  for (const item of promptLibraryItems.value) {
    for (const tag of item.tags) tagSet.add(tag)
  }
  return Array.from(tagSet).sort()
})

async function openPromptLibrary() {
  showPromptLibrary.value = true
  promptLibraryActiveTag.value = undefined
  promptLibraryLoading.value = true
  try {
    const res = await promptLibraryApi.list()
    promptLibraryItems.value = res.data.data || []
  } catch {
    promptLibraryItems.value = []
  } finally {
    promptLibraryLoading.value = false
  }
}

function selectPromptFromLibrary(item: PromptLibraryItem) {
  prompt.value = item.content
  showPromptLibrary.value = false
}

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

const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return getAspectRatios(selectedModel.value, resolution.value)
})

const maxReferenceImages = computed(() => selectedModel.value?.maxReferenceImages ?? 9)
const maxPromptChars = computed(() => selectedModel.value?.maxPromptChars ?? 32000)
const promptExceeded = computed(() => prompt.value.length > maxPromptChars.value)
const currentPrice = computed(() => {
  if (!selectedModel.value) return 0
  return getPrice(selectedModel.value, resolution.value)
})

const canAddImage = computed(() => referenceImages.value.length < maxReferenceImages.value)
	const canGenerate = computed(() => {
	  if (prompt.value.trim().length === 0 || prompt.value.length > maxPromptChars.value) return false
	  if (!serverStatus.loaded) return false
	  if (!serverStatus.sharedKeyConfigured) return false
	  return true
	})

// Model change: reset resolution/aspect to valid values
function handleModelChange() {
  const model = selectedModel.value
  if (model) {
    if (!model.resolutions.includes(resolution.value)) {
      resolution.value = model.resolutions[0]
    }
    const ratios = getAspectRatios(model, resolution.value)
    if (!ratios.includes(aspectRatio.value)) {
      aspectRatio.value = ratios[0]
    }
  }
}

// When resolution changes, validate aspect ratio is still valid for new resolution
function handleResolutionChange() {
  const model = selectedModel.value
  if (model) {
    const ratios = getAspectRatios(model, resolution.value)
    if (!ratios.includes(aspectRatio.value)) {
      aspectRatio.value = ratios[0]
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
  const text = e.dataTransfer?.getData('text/plain')
  if (text?.startsWith('data:image/')) {
    if (!canAddImage.value) return
    referenceImages.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dataUrl: text,
      label: `图片${referenceImages.value.length + 1}`,
    })
    return
  }
  // Handle regular URL dragged from task list or browser
  if (text?.startsWith('http://') || text?.startsWith('https://')) {
    if (!canAddImage.value) return
    referenceImages.value.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dataUrl: text,
      label: `参考图${referenceImages.value.length + 1}`,
      sourceUrl: text,
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

  // Build ordered ref list to preserve user's drag-and-drop order
  const refImages = referenceImages.value.map((r) => {
    if (r.sourceUrl) return { url: r.sourceUrl }
    return { file: dataUrlToFile(r.dataUrl, r.label) }
  })

  emit('generate', {
    modelId: selectedModelId.value,
    prompt: prompt.value.trim(),
    resolution: resolution.value,
    aspectRatio: aspectRatio.value,
    count: count.value,
    templateUrls,
    tempImageFiles,
    refImages,
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
    <div class="form-scroll-area">
      <h3 class="section-title">生成参数</h3>

      <!-- Key missing warning -->
      <el-alert
        v-if="serverStatus.loaded && !serverStatus.sharedKeyConfigured"
        title="管理员尚未配置共享 API Key，生图功能暂不可用"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      />

      <!-- Model -->
      <div class="form-row-inline">
        <label class="form-label-left">模型</label>
        <div class="form-control-right">
          <el-select v-model="selectedModelId" style="width: 100%" @change="handleModelChange">
            <el-option v-for="m in MODELS" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </div>
      </div>

      <!-- Reference Images -->
      <div class="form-row-inline form-row-top">
        <label class="form-label-left">参考图片</label>
        <div class="form-control-right">
          <div class="control-header">
            <el-button
              size="small"
              :icon="Picture"
              @click="showTemplateSelector = true"
              :disabled="!canAddImage"
            >
              从模板库选择
            </el-button>
          </div>
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
              @click="openPreview(img.dataUrl)"
            >
              <img :src="img.dataUrl" :alt="img.label" draggable="false" />
              <el-button
                class="remove-btn"
                type="danger"
                :icon="Delete"
                circle
                size="small"
                @click.stop="handleRemoveImage(index)"
              />
            </div>
            <div v-if="canAddImage" class="add-image-btn" @click="handleAddImage">
              <el-icon size="28"><Plus /></el-icon>
              <span>添加图片</span>
            </div>
          </div>
          <p v-if="referenceImages.length > 0" class="image-hint">可拖拽排序，最多{{ maxReferenceImages }}张</p>
        </div>
      </div>

      <!-- Prompt -->
      <div class="form-row-inline form-row-top">
        <label class="form-label-left">提示词 <span class="required">*</span></label>
        <div class="form-control-right">
          <div class="control-header">
            <el-button size="small" :icon="Collection" @click="openPromptLibrary">从提示词库选择</el-button>
          </div>
          <el-input
            v-model="prompt"
            type="textarea"
            :rows="4"
            placeholder="描述你想要生成的图片..."
            :class="{ 'prompt-exceeded': promptExceeded }"
          />
          <div class="prompt-footer">
            <span v-if="promptExceeded" class="prompt-limit-exceeded">超出字数限制</span>
            <span class="prompt-count" :class="{ exceeded: promptExceeded }">{{ prompt.length }}/{{ maxPromptChars }}</span>
          </div>
        </div>
      </div>

      <!-- Resolution -->
      <div class="form-row-inline">
        <label class="form-label-left">分辨率</label>
        <div class="form-control-right">
          <el-radio-group v-model="resolution" @change="handleResolutionChange">
            <el-radio-button v-for="r in availableResolutions" :key="r" :value="r">
              {{ r }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- Aspect Ratio -->
      <div class="form-row-inline">
        <label class="form-label-left">宽高比</label>
        <div class="form-control-right">
          <el-select v-model="aspectRatio" style="width: 100%">
            <el-option v-for="ar in availableAspectRatios" :key="ar" :label="ar" :value="ar" />
          </el-select>
        </div>
      </div>

      <!-- Count -->
      <div class="form-row-inline">
        <label class="form-label-left">生成数量</label>
        <div class="form-control-right">
          <el-select v-model="count" style="width: 100%">
            <el-option v-for="n in [1, 2, 3, 4, 5]" :key="n" :label="`${n}张`" :value="n" />
          </el-select>
        </div>
      </div>

      <!-- Template Selector Dialog -->
      <TemplateSelector
        v-model:visible="showTemplateSelector"
        @select="handleTemplateSelect"
      />

      <!-- Image Preview Lightbox -->
      <Teleport to="body">
        <div v-if="previewVisible" class="preview-overlay" @click="previewVisible = false">
          <img :src="previewImageUrl" @click.stop />
        </div>
      </Teleport>

      <!-- Prompt Library Dialog -->
      <el-dialog v-model="showPromptLibrary" title="选择提示词" width="1200px" :close-on-click-modal="false">
        <!-- Tag filter -->
        <div v-if="promptLibraryAllTags.length > 0" class="pl-tag-filter">
          <el-tag
            :type="!promptLibraryActiveTag ? 'primary' : 'info'"
            size="small"
            class="pl-tag-chip"
            @click="promptLibraryActiveTag = undefined"
          >
            全部
          </el-tag>
          <el-tag
            v-for="tag in promptLibraryAllTags"
            :key="tag"
            :type="promptLibraryActiveTag === tag ? 'primary' : 'info'"
            size="small"
            class="pl-tag-chip"
            @click="promptLibraryActiveTag = tag"
          >
            {{ tag }}
          </el-tag>
        </div>

        <div v-if="promptLibraryLoading" style="text-align:center;padding:40px">
          <el-icon class="is-loading" :size="24"><Collection /></el-icon>
          <p style="margin-top:8px;color:var(--el-text-color-secondary)">加载中...</p>
        </div>
        <div v-else-if="promptLibraryFiltered.length === 0" style="text-align:center;padding:40px">
          <el-empty v-if="promptLibraryItems.length === 0" description="提示词库为空，请先在提示词库页面添加" :image-size="50" />
          <el-empty v-else description="没有匹配的提示词" :image-size="50" />
        </div>
        <div v-else class="prompt-select-list">
          <div v-for="item in promptLibraryFiltered" :key="item.id" class="prompt-select-item" @click="selectPromptFromLibrary(item)">
            <div class="psi-name">{{ item.name }}</div>
            <div class="psi-content">{{ item.content }}</div>
            <div v-if="item.tags.length > 0" class="psi-tags">
              <el-tag v-for="tag in item.tags" :key="tag" size="small">{{ tag }}</el-tag>
            </div>
          </div>
        </div>
      </el-dialog>
    </div>

    <!-- Footer: button pinned to bottom -->
    <div class="form-footer">
      <el-button
        type="primary"
        size="large"
        :disabled="!canGenerate"
        style="width: 100%"
        @click="handleGenerate"
      >
        生成图片 · ¥{{ currentPrice.toFixed(3) }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
/* ─── Full-height flex layout ─── */
.generation-form {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.form-scroll-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px; /* room for scrollbar */
}
.form-footer {
  flex-shrink: 0;
  padding-top: 16px;
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.section-title {
  font-size: var(--el-font-size-medium);
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 14px 0;
}

/* ─── Inline row layout: label left, control right ─── */
.form-row-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.form-row-inline.form-row-top {
  align-items: flex-start;
}
/* Last row: no separator */
.form-scroll-area > .form-row-inline:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.form-label-left {
  width: 72px;
  flex-shrink: 0;
  text-align: right;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  line-height: 32px;
}
.form-row-top .form-label-left {
  line-height: 32px;
  padding-top: 2px;
}

.form-control-right {
  flex: 1;
  min-width: 0;
}

.control-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.required { color: var(--el-color-danger); }

/* ─── Images ─── */
.images-container {
  display: flex; flex-wrap: wrap; gap: 8px;
  min-height: 104px; border-radius: var(--momo-radius-md); padding: 4px;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  border: 2px dashed transparent;
}
.images-container.is-drag-over {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 4px var(--el-color-primary-light-5);
}
.image-item {
  position: relative; width: 100px; height: 100px;
  border-radius: var(--momo-radius-md); overflow: hidden;
  border: 2px solid var(--el-border-color);
  cursor: grab;
  transition: border-color 0.2s, opacity 0.2s;
}
.image-item:hover { border-color: var(--el-color-primary); }
.image-item.is-dragging { opacity: 0.5; border-color: var(--el-color-primary); }
.image-item img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }

.remove-btn {
  position: absolute; top: 3px; right: 3px;
  opacity: 0; transition: opacity 0.2s;
}
.image-item:hover .remove-btn { opacity: 1; }

.add-image-btn {
  width: 100px; height: 100px;
  border: 2px dashed var(--el-border-color); border-radius: var(--momo-radius-md);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  cursor: pointer; color: var(--el-text-color-secondary);
  transition: border-color 0.2s, color 0.2s;
}
.add-image-btn:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.add-image-btn span { font-size: var(--momo-font-size-sm); margin-top: 4px; }

.image-hint {
  font-size: var(--momo-font-size-xs); color: var(--el-text-color-placeholder); margin-top: 6px;
}

/* ─── Prompt ─── */
.prompt-footer { display: flex; justify-content: space-between; margin-top: 4px; }
.prompt-count { font-size: var(--momo-font-size-xs); color: var(--el-text-color-placeholder); }
.prompt-count.exceeded { color: var(--el-color-danger); font-weight: 500; }
.prompt-limit-exceeded { font-size: var(--momo-font-size-xs); color: var(--el-color-danger); }
.prompt-exceeded :deep(.el-textarea__inner) { border-color: var(--el-color-danger); }

.pl-tag-filter { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.pl-tag-chip { cursor: pointer; user-select: none; }

.prompt-select-list {
  max-height: 500px; overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.prompt-select-item {
  padding: 10px 12px; border: 1px solid var(--el-border-color-light);
  border-radius: var(--momo-radius-md); cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.prompt-select-item:hover { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.psi-name { font-weight: 600; font-size: var(--momo-font-size-base); color: var(--el-text-color-primary); margin-bottom: 4px; }
.psi-content {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-regular); white-space: pre-wrap; word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.psi-tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }

/* ─── Preview Lightbox ─── */
.preview-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: var(--momo-color-overlay);
  cursor: pointer;
}
.preview-overlay img {
  max-width: 90vw; max-height: 90vh;
  object-fit: contain; border-radius: var(--momo-radius-sm);
  cursor: default;
}
</style>
