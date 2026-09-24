<script setup lang="ts">
/**
 * GenerationForm - 生图参数表单
 * 从 ToolFlux 复制并改造：去掉 ChannelId/Electron/提示词库，接入 Web API
 */
import { ref, computed } from 'vue'
import { Plus, Sparkles, Trash2, Image, Library, Search, Star, LoaderCircle, TriangleAlert } from '@lucide/vue'
import { formatCredits } from '@/types/adapter'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import type { PromptLibraryItem } from '@/services/promptLibraryApi'
import { usePromptLibrary } from '@/composables/usePromptLibrary'
import TemplateSelector from './TemplateSelector.vue'
import ModelChannelSelect from './ModelChannelSelect.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UiEmptyState, UiImagePreview, UiPagination } from '@/components/ui'

const emit = defineEmits<{
  (e: 'generate', params: {
    logicalModelId: number
    prompt: string
    resolution: string
    aspectRatio: string
    count: number
    refImages?: Array<{ url?: string; file?: File }>
    promptSegments?: Record<string, string>
    negativePrompt?: string
  }): void
}>()

const serverStatus = useServerStatusStore()
const modelCatalog = useModelCatalogStore()

const selectedModelId = ref(0)
const prompt = ref('')
const resolution = ref('')
const aspectRatio = ref('')
const count = ref(1)
const showTemplateSelector = ref(false)
const previewVisible = ref(false)
const previewImageUrl = ref('')

// 结构化提示词字段（从提示词库选择结构化提示词时捕获，随任务提交）
const promptSegments = ref<Record<string, string>>({})
const negativePrompt = ref('')

function openPreview(url: string) {
  previewImageUrl.value = url
  previewVisible.value = true
}

// Prompt library selector
const showPromptLibrary = ref(false)
const {
  items: promptLibraryItems,
  loading: promptLibraryLoading,
  keyword: promptLibraryKeyword,
  activeTag: promptLibraryActiveTag,
  onlyFavorites: promptLibraryOnlyFavorites,
  allTags: promptLibraryAllTags,
  displayItems: promptLibraryDisplayItems,
  total: promptLibraryTotal,
  page: promptLibraryPage,
  pageSize: promptLibraryPageSize,
  load: loadPromptLibrary,
  toggleFavorite: togglePromptFavorite,
} = usePromptLibrary({ pageSize: 8 })

async function openPromptLibrary() {
  showPromptLibrary.value = true
  await loadPromptLibrary()
}

function selectPromptFromLibrary(item: PromptLibraryItem) {
  prompt.value = item.content
  // 捕获结构化字段（如有），随任务提交以便发布作品时快照
  promptSegments.value = item.segments || {}
  negativePrompt.value = ''
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

const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedModelId.value))

// 目录加载完成后初始化默认模型（目录第一个可用模型）
modelCatalog.ensureLoaded().then(() => {
  if (!selectedModelId.value) {
    const m = modelCatalog.defaultImageModel
    if (m) {
      selectedModelId.value = m.id
      resolution.value = m.capabilities?.resolutions?.[0] ?? ''
      aspectRatio.value = modelCatalog.aspectRatiosFor(m, resolution.value)[0] ?? '1:1'
    }
  }
})

const availableResolutions = computed(() => selectedModel.value?.capabilities?.resolutions || [])

const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return modelCatalog.aspectRatiosFor(selectedModel.value, resolution.value)
})

const maxReferenceImages = computed(() => selectedModel.value?.capabilities?.maxReferenceImages ?? 9)
const maxPromptChars = computed(() => selectedModel.value?.capabilities?.maxPromptChars ?? 32000)
const promptExceeded = computed(() => prompt.value.length > maxPromptChars.value)
const currentPrice = computed(() => modelCatalog.priceFor(selectedModel.value, resolution.value))
/** 按钮文案：显示本次预计消耗（积分，×张数） */
const generateButtonLabel = computed(() => {
  return `生成图片 · ${formatCredits((currentPrice.value ?? 0) * count.value)}`
})

const canAddImage = computed(() => referenceImages.value.length < maxReferenceImages.value)
	const canGenerate = computed(() => {
	  if (prompt.value.trim().length === 0 || prompt.value.length > maxPromptChars.value) return false
	  if (!serverStatus.loaded) return false
	  if (!serverStatus.canGenerate) return false
	  if (!selectedModelId.value) return false
	  return true
	})

// Model change: reset resolution/aspect to valid values
function handleModelChange() {
  const model = selectedModel.value
  if (model?.capabilities) {
    if (!model.capabilities.resolutions.includes(resolution.value)) {
      resolution.value = model.capabilities.resolutions[0]
    }
    const ratios = modelCatalog.aspectRatiosFor(model, resolution.value)
    if (!ratios.includes(aspectRatio.value)) {
      aspectRatio.value = ratios[0]
    }
  }
}

// When resolution changes, validate aspect ratio is still valid for new resolution
function handleResolutionChange() {
  const model = selectedModel.value
  if (model) {
    const ratios = modelCatalog.aspectRatiosFor(model, resolution.value)
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
  // （/api/files/ 前缀 = direct 存储模式的任务结果站内地址，后端 resolveUpstreamImageUrls 原生支持）
  if (text?.startsWith('http://') || text?.startsWith('https://') || text?.startsWith('/api/files/')) {
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

  // Build ordered ref list to preserve user's drag-and-drop order
  const refImages = referenceImages.value.map((r) => {
    if (r.sourceUrl) return { url: r.sourceUrl }
    return { file: dataUrlToFile(r.dataUrl, r.label) }
  })

  emit('generate', {
    logicalModelId: selectedModelId.value,
    prompt: prompt.value.trim(),
    resolution: resolution.value,
    aspectRatio: aspectRatio.value,
    count: count.value,
    refImages,
    promptSegments: promptSegments.value,
    negativePrompt: negativePrompt.value,
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
async function setParams(params: {
  logicalModelId?: number | null
  modelId: string
  prompt: string
  resolution: string
  aspectRatio: string
  referenceImages?: { dataUrl: string; sourceUrl?: string }[]
  promptSegments?: Record<string, string>
  negativePrompt?: string
}) {
  await modelCatalog.ensureLoaded()
  // 旧参数携带模型名字符串：按名反查渠道模型（兼容历史任务「重新生成」）
  const cm = modelCatalog.getModel(params.logicalModelId) ?? modelCatalog.getModelByName(params.modelId)
  if (cm?.capabilities) {
    selectedModelId.value = cm.id
    resolution.value = cm.capabilities.resolutions.includes(params.resolution)
      ? params.resolution
      : (cm.capabilities.resolutions[0] ?? params.resolution)
    const ratios = modelCatalog.aspectRatiosFor(cm, resolution.value)
    aspectRatio.value = ratios.includes(params.aspectRatio) ? params.aspectRatio : (ratios[0] ?? params.aspectRatio)
  }
  prompt.value = params.prompt
  promptSegments.value = { ...(params.promptSegments || {}) }
  negativePrompt.value = params.negativePrompt || ''
  referenceImages.value = (params.referenceImages || [])
    .slice(0, maxReferenceImages.value)
    .map((img, i) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${i}`,
      dataUrl: img.dataUrl,
      label: `参考图${i + 1}`,
      sourceUrl: img.sourceUrl,
    }))
}

defineExpose({ setParams })
</script>

<template>
  <div class="generation-form">
    <div class="form-scroll-area">

      <!-- Key missing warning -->
      <Alert
        v-if="serverStatus.loaded && !serverStatus.canGenerate"
        variant="warning"
        class="mb-4"
      >
        <TriangleAlert />
        <AlertTitle>暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型</AlertTitle>
      </Alert>

      <!-- Reference Images -->
      <div class="form-row image-section" role="region" aria-label="图片区">
        <div class="section-heading">
          <label class="form-label">参考图片</label>
            <Button
              size="sm"
              variant="outline"
              :disabled="!canAddImage"
              @click="showTemplateSelector = true"
            >
              <Image />
              从模板库选择
            </Button>
        </div>
        <div class="min-w-0 flex-1">
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
              class="image-item group"
              :class="{ 'is-dragging': draggedIndex === index }"
              draggable="true"
              @dragstart="handleDragStart(index)"
              @dragover.prevent="handleDragOverItem(index)"
              @dragend="handleDragEnd"
              @click="openPreview(img.dataUrl)"
            >
              <img :src="img.dataUrl" :alt="img.label" draggable="false" class="size-full object-cover" />
              <Button
                variant="destructive"
                size="icon-xs"
                class="absolute top-1 right-1 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                @click.stop="handleRemoveImage(index)"
              >
                <Trash2 />
              </Button>
            </div>
            <button
              v-if="canAddImage"
              class="upload-reference"
              type="button"
              @click="handleAddImage"
            >
              <Plus class="size-7" :stroke-width="1.5" />
              <span class="mt-1 text-xs">添加参考图片</span>
            </button>
          </div>
          <p v-if="referenceImages.length > 0" class="text-muted-foreground/70 mt-1.5 text-xs">可拖拽排序，最多{{ maxReferenceImages }}张</p>
        </div>
      </div>

      <!-- Prompt -->
      <div class="form-row prompt-section" role="region" aria-label="提示词区">
        <div class="section-heading">
          <label for="free-gen-prompt" class="form-label">画面描述 <span class="text-destructive">*</span></label>
            <Button size="sm" variant="outline" @click="openPromptLibrary">
              <Library />
              从提示词库选择
            </Button>
        </div>
        <div class="min-w-0 flex-1 prompt-body">
          <Textarea
            id="free-gen-prompt"
            v-model="prompt"
            :rows="4"
            placeholder="描述你想要生成的图片..."
            :class="{ 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20': promptExceeded }"
          />
          <div class="mt-1 flex justify-between">
            <span v-if="promptExceeded" class="text-destructive text-xs">超出字数限制</span>
            <span class="text-xs" :class="promptExceeded ? 'text-destructive font-medium' : 'text-muted-foreground/70'">{{ prompt.length }}/{{ maxPromptChars }}</span>
          </div>
        </div>
      </div>


      <!-- Template Selector Dialog -->
      <TemplateSelector
        v-model:visible="showTemplateSelector"
        @select="handleTemplateSelect"
      />

      <!-- Image Preview Lightbox -->
      <UiImagePreview v-model="previewVisible" :url="previewImageUrl" />

      <!-- Prompt Library Dialog -->
      <Dialog :open="showPromptLibrary" @update:open="(v: boolean) => (showPromptLibrary = v)">
        <DialogContent class="sm:max-w-3xl" @pointer-down-outside.prevent>
          <DialogHeader>
            <DialogTitle>选择提示词</DialogTitle>
          </DialogHeader>

          <!-- 筛选容器：模糊搜索 + 仅看收藏 -->
          <div class="mb-3 flex items-center gap-4">
            <div class="relative w-80 max-w-full">
              <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input v-model="promptLibraryKeyword" placeholder="搜索提示词标题和正文" class="pl-8" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-foreground/80 text-sm">仅看收藏</span>
              <Switch v-model="promptLibraryOnlyFavorites" />
            </div>
          </div>

          <!-- Tag filter -->
          <div v-if="promptLibraryAllTags.length > 0" class="mb-3.5 flex flex-wrap gap-1.5">
            <Badge
              :variant="!promptLibraryActiveTag ? 'default' : 'secondary'"
              class="cursor-pointer select-none"
              @click="promptLibraryActiveTag = undefined"
            >
              全部
            </Badge>
            <Badge
              v-for="tag in promptLibraryAllTags"
              :key="tag"
              :variant="promptLibraryActiveTag === tag ? 'default' : 'secondary'"
              class="cursor-pointer select-none"
              @click="promptLibraryActiveTag = tag"
            >
              {{ tag }}
            </Badge>
          </div>

          <div v-if="promptLibraryLoading" class="py-10 text-center">
            <LoaderCircle class="text-muted-foreground mx-auto size-6 animate-spin" />
            <p class="text-muted-foreground mt-2 text-sm">加载中...</p>
          </div>
          <template v-else-if="promptLibraryDisplayItems.length === 0">
            <UiEmptyState v-if="promptLibraryItems.length === 0" title="提示词库为空，请先在提示词库页面添加" />
            <UiEmptyState v-else title="没有匹配的提示词" />
          </template>
          <div v-else class="flex max-h-110 flex-col gap-2 overflow-y-auto">
            <div
              v-for="item in promptLibraryDisplayItems"
              :key="item.id"
              class="border-border-light hover:border-primary hover:bg-accent flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors"
              @click="selectPromptFromLibrary(item)"
            >
              <Star
                class="mt-0.5 size-4 shrink-0 cursor-pointer transition-colors"
                :class="item.is_starred ? 'fill-warning text-warning' : 'text-muted-foreground/50 hover:text-warning'"
                @click.stop="togglePromptFavorite(item)"
              />
              <div class="min-w-0 flex-1">
                <div class="text-foreground mb-1 text-sm font-semibold">{{ item.name }}</div>
                <div class="text-foreground/80 line-clamp-2 text-sm break-all whitespace-pre-wrap">{{ item.content }}</div>
                <div v-if="item.tags.length > 0" class="mt-1.5 flex flex-wrap gap-1">
                  <Badge v-for="tag in item.tags" :key="tag" variant="secondary">{{ tag }}</Badge>
                </div>
              </div>
            </div>
          </div>

          <!-- 分页器 -->
          <div v-if="promptLibraryTotal > promptLibraryPageSize" class="mt-3.5 flex justify-center">
            <UiPagination
              v-model:current-page="promptLibraryPage"
              :page-size="promptLibraryPageSize"
              :page-sizes="[promptLibraryPageSize]"
              :total="promptLibraryTotal"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>

    <!-- Footer: params bar + generate button pinned to bottom -->
    <div class="form-footer" role="region" aria-label="参数区">
      <div class="params-bar">
        <div class="param-item">
          <label class="param-label">模型</label>
          <ModelChannelSelect content-position="popper" v-model="selectedModelId" class="w-full" @change="handleModelChange" />
        </div>
        <div class="param-item">
          <label class="param-label">画面比例</label>
          <Select :model-value="aspectRatio" @update:model-value="(v) => (aspectRatio = String(v))">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="选择宽高比" />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem v-for="ar in availableAspectRatios" :key="ar" :value="ar">{{ ar }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="param-item">
          <label class="param-label">生成数量</label>
          <Select :model-value="String(count)" @update:model-value="(v) => (count = Number(v))">
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="String(n)">{{ n }}张</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="param-item">
          <label class="param-label">分辨率</label>
          <Select :model-value="resolution" @update:model-value="(v) => { resolution = String(v); handleResolutionChange() }">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="选择分辨率" />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        size="lg"
        class="w-full"
        :disabled="!canGenerate"
        @click="handleGenerate"
      >
        <Sparkles :size="18" />{{ generateButtonLabel }}
      </Button>
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
  border-top: 1px solid var(--momo-color-border-soft);
}

/* ─── Params bar: one row of dropdowns above the generate button ─── */
.params-bar {
  display: grid;
  grid-template-columns: minmax(160px, 1.4fr) repeat(3, minmax(112px, 1fr));
  align-items: end;
  gap: 12px;
  margin-bottom: 12px;
  overflow-x: auto;
}
.param-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
}
.param-label {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
}

/* ─── Inline row layout: label left, control right ─── */
.form-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--momo-color-border-soft);
}

.form-label {
  width: 72px;
  flex-shrink: 0;
  text-align: right;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
  line-height: 32px;
  padding-top: 2px;
}

/* ─── Images ─── */
.images-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 104px;
  border-radius: var(--momo-radius-md);
  padding: 4px;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  border: 2px dashed transparent;
}
.images-container.is-drag-over {
  background: var(--momo-color-brand-subtle);
  border-color: var(--momo-color-brand);
  box-shadow: 0 0 0 4px var(--momo-color-ring);
}
.image-item {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  border: 2px solid var(--momo-color-border);
  cursor: grab;
  transition: border-color 0.2s, opacity 0.2s;
}
.image-item:hover { border-color: var(--momo-color-brand); }
.image-item.is-dragging { opacity: 0.5; border-color: var(--momo-color-brand); }
.image-item img { pointer-events: none; }
</style>

<style scoped>
/* Production studio: retain real catalog and submission handlers. */
.generation-form{min-height:0;gap:var(--momo-space-4);background:transparent;overflow:hidden}
.form-scroll-area{display:flex;flex-direction:column;gap:var(--momo-space-4);padding:0}
.form-row{display:block;border:1px solid var(--momo-color-border-soft);padding:var(--momo-space-6);margin:0;background:var(--momo-color-bg);border-radius:var(--momo-space-5)}
.image-section{flex-shrink:0}
.prompt-section{flex:1;display:flex;flex-direction:column;align-items:stretch;min-height:min-content}
.prompt-body{display:flex;flex-direction:column}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:var(--momo-space-3);margin-bottom:var(--momo-space-3);flex-shrink:0}
.section-heading>button{flex-shrink:0}
.prompt-section :deep(textarea){flex:1;min-height:calc(var(--momo-space-16) * 2)}
.form-label{display:block;text-align:left;width:auto;color:var(--momo-color-text);font-weight:var(--momo-font-weight-medium);line-height:var(--momo-leading-normal);padding:0}
.images-container{padding:0;gap:var(--momo-space-3);min-height:0}
.image-item,.upload-reference{width:clamp(100px,13vw,164px);height:auto;aspect-ratio:1;border-radius:var(--momo-radius-xl)}
.upload-reference{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:var(--momo-space-2);border:1px dashed var(--momo-color-brand-border);background:var(--momo-color-bg-soft);color:var(--momo-color-text-secondary)}
.upload-reference:hover{background:var(--momo-color-brand-subtle)}
.form-scroll-area :deep(textarea){min-height:var(--momo-space-16);border-radius:var(--momo-radius-xl);resize:vertical}
.form-footer{border:1px solid var(--momo-color-border-soft);margin:0;padding:var(--momo-space-6);background:var(--momo-color-bg);border-radius:var(--momo-space-5)}
.params-bar{grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,1fr));gap:var(--momo-space-2);overflow:visible;margin-bottom:var(--momo-space-4)}
.param-label{font-size:var(--momo-font-size-xs)}
.param-item :deep([data-slot=select-trigger]){min-width:0;padding-inline:var(--momo-space-2)}
.form-footer>button{height:calc(var(--momo-space-12) + var(--momo-space-1));border-radius:var(--momo-radius-xl);font-size:var(--momo-font-size-base)}
@media(max-width:1200px){.params-bar{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.form-row,.form-footer{padding:var(--momo-space-4)}.image-item,.upload-reference{width:calc(var(--momo-space-16) * 2)}}
</style>
