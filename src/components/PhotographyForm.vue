<script setup lang="ts">
/**
 * PhotographyForm — AI摄影表单
 *
 * 图片池 → 元素区 拖拽分配，一图可多用（复制语义）。
 * 管理员在后台配置元素及每元素的系统提示词。
 */
import { ref, computed, onMounted, watch } from 'vue'
import type { ModelId } from '@/types/adapter'
import { formatCredits } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import { useServerStatusStore } from '@/stores/serverStatus'
import { photographyApi } from '@/services/photographyApi'
import type { PhotographyElement } from '@/services/photographyApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import PromptEditorPanel from './PromptEditorPanel.vue'
import ModelChannelSelect from './ModelChannelSelect.vue'
import { Plus, Delete, Camera } from '@element-plus/icons-vue'

const { warning } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Emit ───
const emit = defineEmits<{
  (e: 'generate', params: {
    channelModelId: number
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
const selectedChannelModelId = ref(0)
const resolution = ref('')
const aspectRatio = ref('')
const count = ref(1)
const userPrompt = ref('')

const modelCatalog = useModelCatalogStore()
const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedChannelModelId.value))
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
  if (!selectedChannelModelId.value) {
    const m = modelCatalog.defaultImageModel
    if (m?.capabilities) {
      selectedChannelModelId.value = m.id
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
  if (!selectedChannelModelId.value) return false
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
    channelModelId: selectedChannelModelId.value,
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
    selectedChannelModelId.value = cm.id
    resolution.value = cm.capabilities.resolutions.includes(params.resolution)
      ? params.resolution
      : cm.capabilities.resolutions[0]
    const ratios = modelCatalog.aspectRatiosFor(cm, resolution.value)
    aspectRatio.value = ratios.includes(params.aspectRatio) ? params.aspectRatio : ratios[0]
  } else if (!selectedChannelModelId.value && modelCatalog.defaultImageModel?.capabilities) {
    const dm = modelCatalog.defaultImageModel
    selectedChannelModelId.value = dm.id
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
      <!-- ─── Basic params ─── -->
      <div class="params-row">
        <div class="param-item">
          <label>模型 / 渠道</label>
          <ModelChannelSelect
            v-model="selectedChannelModelId"
            style="width: 380px"
            @change="handleModelChange"
          />
        </div>
        <div class="param-item">
          <label>分辨率</label>
          <el-select v-model="resolution" placeholder="分辨率" style="width: 140px" @change="handleResolutionChange">
            <el-option v-for="r in availableResolutions" :key="r" :label="r" :value="r" />
          </el-select>
        </div>
        <div class="param-item">
          <label>宽高比</label>
          <el-select v-model="aspectRatio" placeholder="宽高比" style="width: 140px">
            <el-option v-for="r in availableAspectRatios" :key="r" :label="r" :value="r" />
          </el-select>
        </div>
        <div class="param-item">
          <label>数量</label>
          <el-input-number v-model="count" :min="1" :max="5" />
        </div>
        <div v-if="currentPrice" class="param-item price">
          <span class="price-tag">{{ formatCredits(currentPrice) }} /张</span>
        </div>
      </div>

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
            class="pool-card"
            :class="{ dragging: poolDragIndex === index }"
            draggable="true"
            @dragstart="handlePoolDragStart(index, $event)"
            @dragover.prevent="handlePoolDragOverItem(index, $event)"
            @dragend="handlePoolDragEnd"
          >
            <img :src="img.dataUrl" class="pool-thumb" />
            <span class="pool-label">图{{ ['一','二','三','四','五','六','七','八','九','十'][index] }}</span>
            <el-button
              class="pool-remove"
              :icon="Delete"
              size="small"
              circle
              @click.stop="handleRemoveFromPool(index)"
            />
          </div>
          <div v-if="poolImages.length < MAX_POOL" class="pool-add" @click="handleUpload">
            <el-icon size="32"><Plus /></el-icon>
            <span>添加图片</span>
          </div>
        </div>
        <p v-if="poolImages.length > 0" class="hint">可拖拽图片排序，拖到下方元素区进行分配（支持一图多用）</p>
      </div>

      <!-- ─── Element zones ─── -->
      <div class="elements-section">
        <label class="section-label">元素分配</label>

        <div v-if="elementsLoading" class="elements-loading">
          <el-icon class="is-loading" size="20"><Camera /></el-icon>
          <span>加载元素配置...</span>
        </div>

        <div v-else-if="photoElements.length === 0" class="elements-empty">
          <el-empty description="暂无元素配置，请联系管理员" :image-size="80" />
        </div>

        <div v-else class="element-zones">
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
              <div v-if="getAssignedCount(el.id) === 0" class="zone-placeholder">
                <el-icon size="24"><Plus /></el-icon>
                <span>拖动图片到此处</span>
              </div>
              <div v-else class="zone-images">
                <div
                  v-for="img in getAssignedImages(el.id)"
                  :key="img.id"
                  class="zone-thumb-wrap"
                >
                  <img :src="img.dataUrl" class="zone-thumb" />
                  <span class="zone-remove" @click="handleRemoveFromElement(el.id, img.id)">&times;</span>
                </div>
                <!-- Empty slot indicator -->
                <div
                  v-for="n in (el.max_images - getAssignedCount(el.id))"
                  :key="'empty-' + n"
                  class="zone-empty-slot"
                >
                  <el-icon size="16"><Plus /></el-icon>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── User prompt ─── -->
      <div class="prompt-section">
        <label class="section-label">提示词 <span class="optional">(可选)</span></label>
        <el-input
          v-model="userPrompt"
          type="textarea"
          :rows="3"
          placeholder="描述你想要的摄影效果..."
          maxlength="5000"
          show-word-limit
        />
      </div>

      <!-- ─── Element prompt editor panel ─── -->
      <div class="prompt-section">
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

      <!-- ─── Generate bar ─── -->
      <div class="generate-bar">
        <el-button
          type="primary"
          size="large"
          :disabled="!canGenerate"
          @click="handleGenerate"
        >
          {{ generateButtonLabel }}
        </el-button>
        <span v-if="!canGenerate && serverStatus.loaded" class="gen-hint">
          {{ serverStatus.canGenerate ? '请至少分配一张图片到元素' : '暂无可用模型，请联系管理员配置渠道与模型' }}
        </span>
      </div>
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

/* ─── Params row ─── */
.params-row {
  display: flex; gap: 16px; align-items: flex-end;
  flex-wrap: wrap; margin-bottom: 20px;
}
.param-item { display: flex; flex-direction: column; gap: 6px; }
.param-item label {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary);
}
.price { margin-left: auto; }
.price-tag {
  font-size: var(--momo-font-size-sm); color: var(--el-color-warning);
  font-weight: 500; white-space: nowrap;
}

/* ─── Sections ─── */
.prompt-section { margin-bottom: 24px; }
.pool-section { margin-bottom: 24px; }
.elements-section { margin-bottom: 24px; }

.section-label {
  display: block;
  font-size: var(--momo-font-size-base); font-weight: 600;
  color: var(--el-text-color-primary); margin-bottom: 10px;
}
.optional { font-weight: 400; color: var(--el-text-color-placeholder); font-size: var(--momo-font-size-sm); }
.count-hint {
  font-weight: 400; color: var(--el-text-color-secondary); font-size: var(--momo-font-size-sm);
}

/* ─── Image pool ─── */
.pool-grid {
  display: flex; flex-wrap: wrap; gap: 10px;
  min-height: 80px;
  padding: 8px;
  border: 2px dashed var(--el-border-color);
  border-radius: var(--momo-radius-md);
  transition: border-color 0.2s, background 0.2s;
}
.pool-grid.drag-over {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.pool-card {
  position: relative;
  width: 100px; height: 100px;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 2px solid transparent;
  cursor: grab;
  transition: border-color 0.2s, opacity 0.2s;
  flex-shrink: 0;
}
.pool-card:hover { border-color: var(--el-color-primary); }
.pool-card.dragging { opacity: 0.4; }

.pool-thumb { width: 100%; height: 100%; object-fit: cover; }

.pool-label {
  position: absolute; bottom: 4px; left: 0; right: 0;
  text-align: center; font-size: 12px; font-weight: 600;
  color: var(--el-color-white);
  background: rgba(0,0,0,0.45);
  padding: 2px 0;
  pointer-events: none;
}

.pool-remove {
  position: absolute; top: 2px; right: 2px;
  opacity: 0; transition: opacity 0.2s;
}
.pool-card:hover .pool-remove { opacity: 1; }

.pool-add {
  width: 100px; height: 100px;
  border: 2px dashed var(--el-border-color-dark);
  border-radius: var(--momo-radius-sm);
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 4px;
  cursor: pointer; color: var(--el-text-color-placeholder);
  transition: border-color 0.2s, color 0.2s;
  flex-shrink: 0;
}
.pool-add:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.pool-add span { font-size: var(--momo-font-size-sm); }

.hint { font-size: var(--momo-font-size-xs); color: var(--el-text-color-placeholder); margin-top: 6px; }

/* ─── Element zones ─── */
.elements-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 24px; color: var(--el-text-color-secondary);
}
.elements-empty { padding: 20px; }

.element-zones {
  display: flex; flex-wrap: wrap; gap: 14px;
}

.element-zone {
  width: 180px;
  border: 2px dashed var(--el-border-color);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--el-fill-color-lighter);
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
.element-zone.drag-over {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 4px var(--el-color-primary-light-5);
}
.element-zone.has-images {
  border-style: solid;
}

.zone-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px;
  background: var(--el-fill-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.zone-label {
  font-size: var(--momo-font-size-sm); font-weight: 600;
  color: var(--el-text-color-primary);
}
.zone-count {
  font-size: var(--momo-font-size-xs); color: var(--el-text-color-secondary);
}

.zone-slot {
  padding: 8px;
  min-height: 72px;
}

.zone-placeholder {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 4px;
  padding: 16px 0; color: var(--el-text-color-placeholder);
  font-size: var(--momo-font-size-sm);
}

.zone-images {
  display: flex; flex-wrap: wrap; gap: 6px;
}

.zone-thumb-wrap {
  position: relative;
  width: 72px; height: 72px;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 1px solid var(--el-border-color);
}

.zone-thumb { width: 100%; height: 100%; object-fit: cover; }

.zone-remove {
  position: absolute; top: 2px; right: 2px;
  width: 20px; height: 20px; line-height: 18px; text-align: center;
  background: rgba(0,0,0,0.6); color: var(--el-color-white);
  border-radius: 50%; font-size: 14px; cursor: pointer;
  opacity: 0; transition: opacity 0.2s;
}
.zone-thumb-wrap:hover .zone-remove { opacity: 1; }

.zone-empty-slot {
  width: 72px; height: 72px;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--momo-radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--el-text-color-placeholder);
}

/* ─── Generate bar ─── */
.generate-bar {
  display: flex; align-items: center; gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.gen-hint {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-secondary);
}
</style>
