<script setup lang="ts">
import { SHOW_PROMPT_EDITOR_ENTRY } from '@/configs/uiFeatures'
/**
 * PhotographyForm — AI摄影表单
 *
 * 图片池 → 元素区 拖拽分配，一图可多用（复制语义）。
 * 管理员在后台配置元素及每元素的系统提示词。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { formatCredits } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import { useServerStatusStore } from '@/stores/serverStatus'
import { photographyApi } from '@/services/photographyApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import PromptEditorPanel from './PromptEditorPanel.vue'
import ModelChannelSelect from './ModelChannelSelect.vue'
import { Plus, Trash2, X, LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/design-system/primitives/button'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { DsParameterPanel, UiEmptyState, UiNumberInput } from '@/components/design-system'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/design-system/primitives/select'

const { warning } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Emit ───
const emit = defineEmits<{
  (e: 'generate', params: {
    logicalModelId: number
    prompt: string
    resolution: string
    aspectRatio: string
    count: number
    refImages: Array<{ url?: string; file?: File }>
    featureId: string
    userPrompt: string
    systemPrompt: string
    supplementaryImages: { name: string; url: string }[]
  }): void
}>()

// ─── Photo elements from server ───
interface ElementDef {
  id: number
  name: string
  label: string
  max_images: number
  sort_order: number
  prompts: Record<string, string>
}

const photoElements = ref<ElementDef[]>([])
const elementsLoading = ref(false)

// 当前会话内用户对各元素提示词的修改：elementId -> modelId -> prompt
const editedElementPrompts = ref<Record<number, Record<string, string>>>({})

async function loadElements() {
  elementsLoading.value = true
  try {
    const res = await photographyApi.getElements()
    photoElements.value = (res.data.data || []) as ElementDef[]
    // 初始化本地编辑缓存
    const map: Record<number, Record<string, string>> = {}
    for (const el of photoElements.value) {
      map[el.id] = { ...el.prompts }
    }
    editedElementPrompts.value = map
  } catch {
    photoElements.value = []
    editedElementPrompts.value = {}
  } finally {
    elementsLoading.value = false
  }
}

function getElementPrompt(el: ElementDef, modelId: string): string {
  return editedElementPrompts.value[el.id]?.[modelId] ?? el.prompts[modelId] ?? ''
}

// ─── Basic params ───
const selectedModelId = ref(0)
const resolution = ref('')
const aspectRatio = ref('')
const count = ref(1)
const userPrompt = ref('')

const modelCatalog = useModelCatalogStore()
const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedModelId.value))
/** 元素提示词键：逻辑模型 code（后台按 model_id 存量数据与逻辑 code 同名，天然兼容） */
const promptKey = computed(() => selectedModel.value?.logicalCode ?? selectedModel.value?.modelId ?? '')
const availableResolutions = computed(() => selectedModel.value?.capabilities?.resolutions || [])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return modelCatalog.aspectRatiosFor(selectedModel.value, resolution.value)
})
/** 展示用单价（积分/张） */
const currentPrice = computed(() => modelCatalog.priceFor(selectedModel.value, resolution.value))
/** 按钮文案：显示本次预计消耗（积分，×张数） */
const generateButtonLabel = computed(() => {
  return `生成图片 · ${formatCredits((currentPrice.value ?? 0) * count.value)}`
})

// 目录加载完成后初始化默认模型
modelCatalog.ensureLoaded().then(() => {
  if (!selectedModelId.value) {
    const m = modelCatalog.defaultImageModel
    if (m?.capabilities) {
      selectedModelId.value = m.id
      resolution.value = m.capabilities.resolutions[0]
      aspectRatio.value = modelCatalog.aspectRatiosFor(m, resolution.value)[0] ?? '1:1'
    }
  }
})

// 已分配图片的活跃元素，按 sort_order 排序
const activePhotoElements = computed(() => {
  return photoElements.value
    .filter(el => getAssignedCount(el.id) > 0)
    .sort((a, b) => a.sort_order - b.sort_order)
})

// 提示词折叠面板：当前模型下各活跃元素的提示词
const elementPromptPanelModel = computed({
  get: () => {
    const result: Record<string, string> = {}
    for (const el of activePhotoElements.value) {
      result[el.id] = getElementPrompt(el, promptKey.value)
    }
    return result
  },
  set: (val: Record<string, string>) => {
    const key = promptKey.value
    for (const [idStr, prompt] of Object.entries(val)) {
      const id = Number(idStr)
      if (!editedElementPrompts.value[id]) editedElementPrompts.value[id] = {}
      editedElementPrompts.value[id][key] = prompt
    }
  },
})

const elementPromptPanelSections = computed(() => {
  return activePhotoElements.value.map(el => ({
    key: String(el.id),
    label: `${el.label} 提示词`,
  }))
})

const defaultElementPromptPanelModel = computed(() => {
  const result: Record<string, string> = {}
  for (const el of activePhotoElements.value) {
    result[el.id] = el.prompts[promptKey.value] ?? ''
  }
  return result
})

function resetElementPrompts() {
  const key = promptKey.value
  for (const el of activePhotoElements.value) {
    if (!editedElementPrompts.value[el.id]) editedElementPrompts.value[el.id] = {}
    editedElementPrompts.value[el.id][key] = el.prompts[key] ?? ''
  }
}

const finalPromptPreview = computed(() => buildPrompt().finalPrompt)

function handleModelChange() {
  const m = selectedModel.value
  if (m?.capabilities) {
    if (!m.capabilities.resolutions.includes(resolution.value)) resolution.value = m.capabilities.resolutions[0]
    aspectRatio.value = modelCatalog.aspectRatiosFor(m, resolution.value)[0]
  }
}
function handleResolutionChange() {
  const m = selectedModel.value
  if (m) {
    const ratios = modelCatalog.aspectRatiosFor(m, resolution.value)
    if (!ratios.includes(aspectRatio.value)) aspectRatio.value = ratios[0]
  }
}

// ─── Image Pool (最多 10 张) ───
const MAX_POOL = 10

interface PoolImage {
  id: string
  dataUrl: string
  file?: File
  sourceUrl?: string
}

const poolImages = ref<PoolImage[]>([])
const poolDragIndex = ref<number | null>(null)

function generatePoolId(): string {
  return `pool-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function handleUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/gif'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    for (const file of Array.from(input.files)) {
      if (poolImages.value.length >= MAX_POOL) break
      const dataUrl = await fileToDataUrl(file)
      poolImages.value = [...poolImages.value, { id: generatePoolId(), dataUrl, file }]
    }
  }
  input.click()
}

function handlePoolDrop(e: DragEvent) {
  e.preventDefault()
  isPoolDragOver.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    for (const file of Array.from(e.dataTransfer.files)) {
      if (poolImages.value.length >= MAX_POOL) break
      if (file.type.startsWith('image/')) {
        fileToDataUrl(file).then(dataUrl => {
          poolImages.value = [...poolImages.value, { id: generatePoolId(), dataUrl, file }]
        })
      }
    }
    return
  }
  // URL from task list or browser（/api/files/ = direct 存储模式的站内结果地址）
  const text = e.dataTransfer?.getData('text/plain')
  if (text?.startsWith('http://') || text?.startsWith('https://') || text?.startsWith('/api/files/')) {
    if (poolImages.value.length >= MAX_POOL) return
    poolImages.value = [...poolImages.value, {
      id: generatePoolId(), dataUrl: text, sourceUrl: text,
    }]
  }
}

const isPoolDragOver = ref(false)
function handlePoolDragOver(e: DragEvent) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' }
function handlePoolDragEnter() { isPoolDragOver.value = true }
function handlePoolDragLeave(e: DragEvent) {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as HTMLElement | null
  if (!related || !target.contains(related)) isPoolDragOver.value = false
}

// ─── Pool reorder ───
function handlePoolDragStart(index: number, e: DragEvent) {
  poolDragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'all'
    e.dataTransfer.setData('application/pool-image-id', poolImages.value[index].id)
  }
}

function handlePoolDragOverItem(index: number, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (poolDragIndex.value === null || poolDragIndex.value === index) return
  const items = [...poolImages.value]
  const [moved] = items.splice(poolDragIndex.value, 1)
  items.splice(index, 0, moved)
  poolImages.value = items
  poolDragIndex.value = index
}

function handlePoolDragEnd() { poolDragIndex.value = null }

function handleRemoveFromPool(index: number) {
  // Remove from pool and clear all element assignments referencing this image
  const removedId = poolImages.value[index].id
  for (const elId of Object.keys(elementAssignments.value)) {
    elementAssignments.value[Number(elId)] = elementAssignments.value[Number(elId)].filter(id => id !== removedId)
  }
  poolImages.value = poolImages.value.filter((_, i) => i !== index)
}

// ─── Element assignments ───
// Record<elementId, poolImageId[]>
const elementAssignments = ref<Record<number, string[]>>({})

function getAssignedImages(elementId: number): PoolImage[] {
  const ids = elementAssignments.value[elementId] || []
  return ids.map(id => poolImages.value.find(p => p.id === id)).filter(Boolean) as PoolImage[]
}

function getAssignedCount(elementId: number): number {
  return (elementAssignments.value[elementId] || []).length
}

// ─── Element drop zone ───
const elemDragOver = ref<Record<number, boolean>>({})

function handleElemDragOver(elementId: number, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  elemDragOver.value = { ...elemDragOver.value, [elementId]: true }
}

function handleElemDragLeave(elementId: number, e: DragEvent) {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as HTMLElement | null
  if (!related || !target.contains(related)) {
    elemDragOver.value = { ...elemDragOver.value, [elementId]: false }
  }
}

function handleElemDrop(elementId: number, e: DragEvent) {
  elemDragOver.value = { ...elemDragOver.value, [elementId]: false }
  const poolImageId = e.dataTransfer?.getData('application/pool-image-id')
  if (!poolImageId) return

  // Check max count
  const el = photoElements.value.find(e => e.id === elementId)
  if (!el) return
  const current = getAssignedCount(elementId)
  if (current >= el.max_images) {
    warning(`「${el.label}」最多接受 ${el.max_images} 张图片`)
    return
  }

  // Check pool image exists
  const poolImg = poolImages.value.find(p => p.id === poolImageId)
  if (!poolImg) return

  // Add (avoid duplicate in same element)
  const currentIds = elementAssignments.value[elementId] || []
  if (currentIds.includes(poolImageId)) return

  elementAssignments.value = {
    ...elementAssignments.value,
    [elementId]: [...currentIds, poolImageId],
  }
}

function handleRemoveFromElement(elementId: number, poolImageId: string) {
  elementAssignments.value = {
    ...elementAssignments.value,
    [elementId]: (elementAssignments.value[elementId] || []).filter(id => id !== poolImageId),
  }
}

// ─── Generate ───
const canGenerate = computed(() => {
  if (!serverStatus.loaded) return false
  if (!serverStatus.canGenerate) return false
  if (!selectedModelId.value) return false
  // At least one element with an image
  const hasAnyAssignment = Object.values(elementAssignments.value).some(ids => ids.length > 0)
  if (!hasAnyAssignment) return false
  return true
})

function buildPrompt(): { systemPrompt: string; finalPrompt: string } {
  const modelId = promptKey.value

  // Collect elements that have assigned images, ordered by sort_order
  const activeElements = photoElements.value
    .filter(el => getAssignedCount(el.id) > 0)
    .sort((a, b) => a.sort_order - b.sort_order)

  // Build element system prompts
  const systemParts: string[] = []
  for (const el of activeElements) {
    const prompt = getElementPrompt(el, modelId)
    if (prompt && prompt.trim()) {
      systemParts.push(prompt.trim())
    }
  }

  // Build image mapping description
  const uniqueImageIds: string[] = []
  const imageIndexMap = new Map<string, number>() // poolImageId → 1-based index
  const elementMap: Array<{ label: string; indices: number[] }> = []

  for (const el of activeElements) {
    const assignedIds = elementAssignments.value[el.id] || []
    const indices: number[] = []
    for (const imgId of assignedIds) {
      if (!imageIndexMap.has(imgId)) {
        uniqueImageIds.push(imgId)
        imageIndexMap.set(imgId, uniqueImageIds.length)
      }
      indices.push(imageIndexMap.get(imgId)!)
    }
    elementMap.push({ label: el.label, indices })
  }

  // Build mapping text
  const mappingLines: string[] = []
  if (uniqueImageIds.length > 0) {
    mappingLines.push('', '参考图映射（按顺序）：')
    // Group by index
    const indexToLabels = new Map<number, string[]>()
    for (const em of elementMap) {
      for (const idx of em.indices) {
        const labels = indexToLabels.get(idx) || []
        labels.push(em.label)
        indexToLabels.set(idx, labels)
      }
    }
    for (let i = 1; i <= uniqueImageIds.length; i++) {
      const labels = indexToLabels.get(i) || []
      mappingLines.push(`第${i}张 — ${labels.map(l => l + '参考').join('、')}`)
    }
    mappingLines.push('')
  }

  const systemPrompt = systemParts.join('\n') + mappingLines.join('\n')
  const finalPrompt = systemPrompt + (userPrompt.value.trim() ? '\n' + userPrompt.value.trim() : '')

  return { systemPrompt, finalPrompt }
}

function handleGenerate() {
  const { systemPrompt, finalPrompt } = buildPrompt()

  // Build refImages list from unique assigned images (deduplicated, ordered by element sort_order first appearance)
  const seenIds = new Set<string>()
  const refImages: Array<{ url?: string; file?: File }> = []
  const supplementaryImages: { name: string; url: string }[] = []

  const activeElements = photoElements.value
    .filter(el => getAssignedCount(el.id) > 0)
    .sort((a, b) => a.sort_order - b.sort_order)

  for (const el of activeElements) {
    const assignedIds = elementAssignments.value[el.id] || []
    for (const imgId of assignedIds) {
      const poolImg = poolImages.value.find(p => p.id === imgId)
      if (!poolImg) continue
      if (!seenIds.has(imgId)) {
        seenIds.add(imgId)
        if (poolImg.sourceUrl) {
          refImages.push({ url: poolImg.sourceUrl })
        } else if (poolImg.file) {
          refImages.push({ file: poolImg.file })
        } else {
          refImages.push({ url: poolImg.dataUrl })
        }
      }
      // supplementaryImages records the full mapping for task detail
      supplementaryImages.push({ name: el.label, url: poolImg.sourceUrl || poolImg.dataUrl })
    }
  }

  emit('generate', {
    logicalModelId: selectedModelId.value,
    prompt: finalPrompt,
    resolution: resolution.value,
    aspectRatio: aspectRatio.value,
    count: count.value,
    refImages,
    featureId: 'ai-photography',
    userPrompt: userPrompt.value.trim(),
    systemPrompt,
    supplementaryImages,
  })
}

// ─── External setParams (for re-edit from task list) ───
const pendingRestore = ref<{ name: string; url: string }[] | null>(null)

function setParams(params: {
  modelId: string
  resolution: string
  aspectRatio: string
  userPrompt?: string
  supplementaryImages?: { name: string; url: string }[]
}) {
  // 旧参数携带模型名字符串：按名反查渠道模型（兼容历史任务「重新生成」）
  const cm = modelCatalog.getModelByName(params.modelId)
  if (cm?.capabilities) {
    selectedModelId.value = cm.id
    resolution.value = cm.capabilities.resolutions.includes(params.resolution)
      ? params.resolution
      : cm.capabilities.resolutions[0]
    const ratios = modelCatalog.aspectRatiosFor(cm, resolution.value)
    aspectRatio.value = ratios.includes(params.aspectRatio) ? params.aspectRatio : ratios[0]
  } else if (!selectedModelId.value && modelCatalog.defaultImageModel?.capabilities) {
    const dm = modelCatalog.defaultImageModel
    selectedModelId.value = dm.id
    resolution.value = dm.capabilities!.resolutions[0]
    aspectRatio.value = modelCatalog.aspectRatiosFor(dm, resolution.value)[0]
  }
  userPrompt.value = params.userPrompt || ''

  if (!params.supplementaryImages || params.supplementaryImages.length === 0) return

  // If elements not yet loaded, defer restoration
  if (photoElements.value.length === 0) {
    pendingRestore.value = params.supplementaryImages
    return
  }
  restoreFromSupplementary(params.supplementaryImages)
}

function restoreFromSupplementary(images: { name: string; url: string }[]) {
  // 1. Deduplicate URLs → create pool images
  const seenUrls = new Set<string>()
  const urlToPoolId = new Map<string, string>()

  for (const img of images) {
    if (!seenUrls.has(img.url)) {
      seenUrls.add(img.url)
      const poolId = generatePoolId()
      poolImages.value = [...poolImages.value, { id: poolId, dataUrl: img.url, sourceUrl: img.url }]
      urlToPoolId.set(img.url, poolId)
    }
  }

  // 2. Match element labels → element IDs → restore assignments
  const newAssignments: Record<number, string[]> = {}
  for (const img of images) {
    const el = photoElements.value.find(e => e.label === img.name)
    if (!el) continue
    const poolId = urlToPoolId.get(img.url)
    if (!poolId) continue
    const existing = newAssignments[el.id] || []
    if (!existing.includes(poolId)) existing.push(poolId)
    newAssignments[el.id] = existing
  }
  elementAssignments.value = newAssignments
}

// After elements load, apply any pending restore
watch(photoElements, (els) => {
  if (els.length > 0 && pendingRestore.value) {
    restoreFromSupplementary(pendingRestore.value)
    pendingRestore.value = null
  }
})

defineExpose({ setParams })

onMounted(() => loadElements())
</script>

<template>
  <div class="photography-form">
    <div class="form-scroll-area">
      <!-- ─── Image pool ─── -->
      <div class="pool-section">
        <label class="section-label">
          参考图片
          <span class="count-hint">({{ poolImages.length }}/{{ MAX_POOL }})</span>
        </label>
        <div
          class="pool-grid"
          :class="{ 'drag-over': isPoolDragOver }"
          @dragover="handlePoolDragOver"
          @dragenter="handlePoolDragEnter"
          @dragleave="handlePoolDragLeave"
          @drop="handlePoolDrop"
        >
          <div
            v-for="(img, index) in poolImages"
            :key="img.id"
            class="pool-card group"
            :class="{ dragging: poolDragIndex === index }"
            draggable="true"
            @dragstart="handlePoolDragStart(index, $event)"
            @dragover.prevent="handlePoolDragOverItem(index, $event)"
            @dragend="handlePoolDragEnd"
          >
            <img :src="img.dataUrl" class="size-full object-cover" />
            <span class="pool-label">图{{ ['一','二','三','四','五','六','七','八','九','十'][index] }}</span>
            <Button
              variant="destructive"
              size="icon-xs"
              class="absolute top-0.5 right-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              @click.stop="handleRemoveFromPool(index)"
            >
              <Trash2 />
            </Button>
          </div>
          <div
            v-if="poolImages.length < MAX_POOL"
            class="border-border-strong text-muted-foreground/70 hover:border-primary hover:text-primary flex size-25 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed transition-colors"
            @click="handleUpload"
          >
            <Plus class="size-8" :stroke-width="1.5" />
            <span class="text-xs">添加图片</span>
          </div>
        </div>
        <p v-if="poolImages.length > 0" class="text-muted-foreground/70 mt-1.5 text-xs">可拖拽图片排序，拖到下方元素区进行分配（支持一图多用）</p>
      </div>

      <!-- ─── Element zones ─── -->
      <div class="elements-section">
        <label class="section-label">元素分配</label>

        <div v-if="elementsLoading" class="text-muted-foreground flex items-center gap-2 p-6">
          <LoaderCircle class="size-5 animate-spin" />
          <span>加载元素配置...</span>
        </div>

        <div v-else-if="photoElements.length === 0" class="py-5">
          <UiEmptyState title="暂无元素配置，请联系管理员" />
        </div>

        <div v-else class="flex flex-wrap gap-3.5">
          <div
            v-for="el in photoElements"
            :key="el.id"
            class="element-zone"
            :class="{
              'drag-over': elemDragOver[el.id],
              'has-images': getAssignedCount(el.id) > 0,
            }"
            @dragover="handleElemDragOver(el.id, $event)"
            @dragleave="handleElemDragLeave(el.id, $event)"
            @drop="handleElemDrop(el.id, $event)"
          >
            <div class="zone-header">
              <span class="zone-label">{{ el.label }}</span>
              <span class="zone-count">{{ getAssignedCount(el.id) }}/{{ el.max_images }}</span>
            </div>
            <div class="zone-slot">
              <div v-if="getAssignedCount(el.id) === 0" class="text-muted-foreground/70 flex flex-col items-center justify-center gap-1 py-4 text-sm">
                <Plus class="size-6" :stroke-width="1.5" />
                <span>拖动图片到此处</span>
              </div>
              <div v-else class="flex flex-wrap gap-1.5">
                <div
                  v-for="img in getAssignedImages(el.id)"
                  :key="img.id"
                  class="group border-border relative size-18 overflow-hidden rounded-sm border"
                >
                  <img :src="img.dataUrl" class="size-full object-cover" />
                  <Button variant="destructive"
                    type="button"
                    class="absolute top-0.5 right-0.5 flex cursor-pointer items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                    @click="handleRemoveFromElement(el.id, img.id)"
                  >
                    <X class="size-3" />
                  </Button>
                </div>
                <!-- Empty slot indicator -->
                <div
                  v-for="n in (el.max_images - getAssignedCount(el.id))"
                  :key="'empty-' + n"
                  class="border-border text-muted-foreground/50 flex size-18 items-center justify-center rounded-sm border border-dashed"
                >
                  <Plus class="size-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── User prompt ─── -->
      <div class="prompt-section">
        <label class="section-label">提示词 <span class="optional">(可选)</span></label>
        <Textarea
          v-model="userPrompt"
          :rows="3"
          placeholder="描述你想要的摄影效果..."
          maxlength="5000"
        />
        <p class="text-muted-foreground/70 mt-1 text-right text-xs">{{ userPrompt.length }}/5000</p>
      </div>

      <!-- ─── Element prompt editor panel ─── -->
      <div v-if="SHOW_PROMPT_EDITOR_ENTRY" class="prompt-section">
        <PromptEditorPanel
          v-model="elementPromptPanelModel"
          title="查看/编辑元素提示词"
          :sections="elementPromptPanelSections"
          :final-prompt="finalPromptPreview"
          :default-value="defaultElementPromptPanelModel"
          :rows="4"
          @reset="resetElementPrompts"
        />
      </div>

    </div>
    <div class="shrink-0 border-t p-3">
      <DsParameterPanel :label="generateButtonLabel" :disabled="!canGenerate" :reason="!canGenerate && serverStatus.loaded ? (serverStatus.canGenerate ? '请至少分配一张图片到元素' : '暂无可用模型，请联系管理员配置渠道与模型') : undefined" @submit="handleGenerate">
        <div class="ds-parameter">
          <span class="ds-caption">模型</span>
          <ModelChannelSelect v-model="selectedModelId" aria-label="模型" content-position="popper" @change="handleModelChange" />
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">画面比例</span>
          <Select :model-value="aspectRatio" @update:model-value="(v) => (aspectRatio = String(v))">
            <SelectTrigger aria-label="画面比例"><SelectValue placeholder="宽高比" /></SelectTrigger>
            <SelectContent position="popper"><SelectItem v-for="r in availableAspectRatios" :key="r" :value="r">{{ r }}</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">生成数量</span>
          <UiNumberInput v-model="count" :min="1" :max="5" aria-label="生成数量" />
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">分辨率</span>
          <Select :model-value="resolution" @update:model-value="(v) => { resolution = String(v); handleResolutionChange() }">
            <SelectTrigger aria-label="分辨率"><SelectValue placeholder="分辨率" /></SelectTrigger>
            <SelectContent position="popper"><SelectItem v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</SelectItem></SelectContent>
          </Select>
        </div>
      </DsParameterPanel>
    </div>
  </div>
</template>

<style scoped>
.photography-form {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.form-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

/* ─── Sections ─── */
.prompt-section { margin-bottom: 24px; }
.pool-section { margin-bottom: 24px; }
.elements-section { margin-bottom: 24px; }

.section-label {
  display: block;
  font-size: var(--ds-font-body);
  font-weight: 600;
  color: var(--foreground);
  margin-bottom: 10px;
}
.optional { font-weight: 400; color: var(--muted-foreground); font-size: var(--ds-font-small); }
.count-hint {
  font-weight: 400;
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
}

/* ─── Image pool ─── */
.pool-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 80px;
  padding: 8px;
  border: 2px dashed var(--border);
  border-radius: var(--ds-radius);
  transition: border-color 0.2s, background 0.2s;
}
.pool-grid.drag-over {
  border-color: var(--primary);
  background: var(--accent);
}

.pool-card {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: var(--ds-radius);
  overflow: hidden;
  border: 2px solid transparent;
  cursor: grab;
  transition: border-color 0.2s, opacity 0.2s;
  flex-shrink: 0;
}
.pool-card:hover { border-color: var(--primary); }
.pool-card.dragging { opacity: 0.4; }

.pool-label {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: var(--ds-font-small);
  font-weight: 600;
  color: var(--ds-white);
  background: var(--ds-overlay-soft);
  padding: 2px 0;
  pointer-events: none;
}

/* ─── Element zones ─── */
.element-zone {
  width: 180px;
  border: 2px dashed var(--border);
  border-radius: var(--ds-radius);
  overflow: hidden;
  background: var(--muted);
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
.element-zone.drag-over {
  border-color: var(--primary);
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--ring);
}
.element-zone.has-images {
  border-style: solid;
}

.zone-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--muted);
  border-bottom: 1px solid var(--border);
}
.zone-label {
  font-size: var(--ds-font-small);
  font-weight: 600;
  color: var(--foreground);
}
.zone-count {
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
}

.zone-slot {
  padding: 8px;
  min-height: 72px;
}

</style>
