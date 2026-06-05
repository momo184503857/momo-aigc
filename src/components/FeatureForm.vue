<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ModelId } from '@/types/adapter'
import { MODELS, DEFAULT_MODEL, DEFAULT_RESOLUTION, DEFAULT_ASPECT_RATIO, getAspectRatios, getPrice } from '@/types/adapter'
import { useServerStatusStore } from '@/stores/serverStatus'
import { featurePromptApi } from '@/services/featurePromptApi'
import type { FeaturePromptItem } from '@/services/featurePromptApi'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import type { FeatureConfig } from '@/configs/featureConfig'
import { useUiFeedback } from '@/composables/useUiFeedback'
import ImageSlotUpload from './ImageSlotUpload.vue'
import type { SlotImage, StarredTemplate } from './ImageSlotUpload.vue'
import TemplateSelector from './TemplateSelector.vue'
import SupplementaryImageUpload from './SupplementaryImageUpload.vue'
import type { SupplementaryImage } from './SupplementaryImageUpload.vue'
import { templateApi } from '@/services/templateApi'

const { warning } = useUiFeedback()

const props = defineProps<{ featureId: string }>()

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
    userPrompt: string
    systemPrompt: string
    supplementaryImages?: { name: string; url: string }[]
  }): void
}>()

const serverStatus = useServerStatusStore()

// Feature config
const config = computed<FeatureConfig | undefined>(() => FEATURE_CONFIGS[props.featureId])

const slots = computed(() => config.value?.imageSlots || [])

// Per-slot images: key -> SlotImage[]
const slotImages = ref<Record<string, SlotImage[]>>({})
function getSlotImages(slotKey: string): SlotImage[] {
  return slotImages.value[slotKey] || []
}
function setSlotImages(slotKey: string, images: SlotImage[]) {
  slotImages.value = { ...slotImages.value, [slotKey]: images }
}

// Init slot images when featureId changes
watch(() => props.featureId, () => initSlots(), { immediate: true })
function initSlots() {
  const map: Record<string, SlotImage[]> = {}
  config.value?.imageSlots.forEach(s => { map[s.key] = [] })
  slotImages.value = map
}

// Form state
const selectedModelId = ref<ModelId>(DEFAULT_MODEL)
const resolution = ref(DEFAULT_RESOLUTION)
const aspectRatio = ref(DEFAULT_ASPECT_RATIO)
const count = ref(1)
const userPrompt = ref('')

// Supplementary images
const supplementaryImages = ref<SupplementaryImage[]>([])

// Template selector state
const showTemplateSelector = ref(false)
const templateTargetSlot = ref('')

// Starred templates for quick access
const starredTemplates = ref<StarredTemplate[]>([])
async function fetchStarredTemplates() {
  try {
    const res = await templateApi.list({ starred: true, pageSize: 50 })
    starredTemplates.value = (res.data.data?.records || []).map((t: any) => ({
      id: t.id,
      name: t.name || t.original_filename || '',
      public_url: t.public_url,
    }))
  } catch {
    starredTemplates.value = []
  }
}

// Prompts from server
const promptLoading = ref(false)
const promptError = ref(false)
const modelPrompts = ref<Record<string, FeaturePromptItem>>({})

const currentPrompt = computed(() => modelPrompts.value[selectedModelId.value])
const systemPrompt = computed(() => currentPrompt.value?.system_prompt || '')
const userPromptLabel = computed(() => currentPrompt.value?.user_prompt_label || '补充提示词')
const userPromptPlaceholder = computed(() => currentPrompt.value?.user_prompt_placeholder || '')

async function fetchPrompts() {
  promptLoading.value = true
  promptError.value = false
  try {
    const res = await featurePromptApi.get(props.featureId)
    const items: FeaturePromptItem[] = res.data.data || []
    const map: Record<string, FeaturePromptItem> = {}
    items.forEach(item => { map[item.model_id] = item })
    modelPrompts.value = map
  } catch {
    promptError.value = true
    modelPrompts.value = {}
  } finally {
    promptLoading.value = false
  }
}

onMounted(() => {
  fetchPrompts()
  fetchStarredTemplates()
})

// Apply feature defaults from config
watch(config, (cfg) => {
  if (!cfg) return
  if (cfg.defaultModelId) selectedModelId.value = cfg.defaultModelId
  if (cfg.defaultResolution) resolution.value = cfg.defaultResolution
  if (cfg.defaultAspectRatio) aspectRatio.value = cfg.defaultAspectRatio
}, { immediate: true })

// Model computed
const selectedModel = computed(() => MODELS.find(m => m.id === selectedModelId.value))
const availableResolutions = computed(() => selectedModel.value?.resolutions || ['1K'])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return getAspectRatios(selectedModel.value, resolution.value)
})
const currentPrice = computed(() => {
  if (!selectedModel.value) return 0
  return getPrice(selectedModel.value, resolution.value)
})

function handleModelChange() {
  const model = selectedModel.value
  if (model) {
    if (!model.resolutions.includes(resolution.value)) {
      resolution.value = model.resolutions[0]
    }
    aspectRatio.value = getAspectRatios(model, resolution.value)[0]
  }
}

function handleResolutionChange() {
  const model = selectedModel.value
  if (model) {
    const ratios = getAspectRatios(model, resolution.value)
    if (!ratios.includes(aspectRatio.value)) {
      aspectRatio.value = ratios[0]
    }
  }
}

// Validation
const allSlotsFull = computed(() => {
  if (!config.value) return true
  return config.value.imageSlots.every(s => getSlotImages(s.key).length >= s.maxCount)
})

const canGenerate = computed(() => {
  if (!serverStatus.loaded) return false
  if (!config.value) return false
  if (!serverStatus.sharedKeyConfigured) return false
  for (const slot of config.value.imageSlots) {
    if (slot.required && getSlotImages(slot.key).length === 0) return false
  }
  // 检查补充图片是否都已命名
  if (supplementaryImages.value.some(img => !img.name.trim())) return false
  return true
})

function buildFullPrompt(): string {
  const sys = systemPrompt.value
  const user = userPrompt.value.trim()
  if (!sys.includes('{user_prompt}')) {
    return user ? `${sys}\n${user}` : sys
  }
  return sys.replace(/\{user_prompt\}/g, user || '')
}

function handleGenerate() {
  // 检查补充图片是否都已命名
  if (supplementaryImages.value.length > 0 && supplementaryImages.value.some(img => !img.name.trim())) {
    warning('请为所有补充图片命名')
    return
  }

  const templateUrls: string[] = []
  const tempImageFiles: File[] = []
  const refImages: Array<{ url?: string; file?: File }> = []

  config.value?.imageSlots.forEach(slot => {
    const images = getSlotImages(slot.key)
    images.forEach(img => {
      if (img.sourceUrl) {
        templateUrls.push(img.sourceUrl)
        refImages.push({ url: img.sourceUrl })
      } else if (img.file) {
        tempImageFiles.push(img.file)
        refImages.push({ file: img.file })
      } else {
        templateUrls.push(img.dataUrl)
        refImages.push({ url: img.dataUrl })
      }
    })
  })

  emit('generate', {
    modelId: selectedModelId.value,
    prompt: buildFullPrompt(),
    resolution: resolution.value,
    aspectRatio: aspectRatio.value,
    count: count.value,
    templateUrls,
    tempImageFiles,
    refImages,
    userPrompt: userPrompt.value.trim(),
    systemPrompt: systemPrompt.value,
    supplementaryImages: supplementaryImages.value.length > 0
      ? supplementaryImages.value.map(img => ({ name: img.name, url: img.sourceUrl || img.dataUrl }))
      : undefined,
  })
}

function handleTemplateSelect(slotKey: string) {
  templateTargetSlot.value = slotKey
  showTemplateSelector.value = true
}

function handleTemplateConfirm(templates: Array<{ name: string; url: string; previewUrl: string }>) {
  if (!templates.length) return
  const slotKey = templateTargetSlot.value
  const slot = config.value?.imageSlots.find(s => s.key === slotKey)
  if (!slot) return
  const existing = getSlotImages(slotKey)
  const toAdd = templates.slice(0, slot.maxCount)
  const newImages: SlotImage[] = toAdd.map((t, i) => ({
    id: `tpl-${Date.now()}-${i}`,
    dataUrl: t.previewUrl || t.url,
    sourceUrl: t.url,
  }))
  if (existing.length >= slot.maxCount) {
    // Replace
    setSlotImages(slotKey, newImages)
  } else {
    const remaining = slot.maxCount - existing.length
    setSlotImages(slotKey, [...existing, ...newImages.slice(0, remaining)])
  }
}

function handleStarredSelect(slotKey: string, template: StarredTemplate) {
  const slot = config.value?.imageSlots.find(s => s.key === slotKey)
  if (!slot) return
  const existing = getSlotImages(slotKey)
  const newImage: SlotImage = {
    id: `starred-${Date.now()}-${template.id}`,
    dataUrl: template.public_url,
    sourceUrl: template.public_url,
  }
  if (existing.length >= slot.maxCount) {
    // Replace the first image
    setSlotImages(slotKey, [newImage])
  } else {
    setSlotImages(slotKey, [...existing, newImage])
  }
}

// Exposed for copyParams
function setParams(params: {
  modelId: ModelId
  prompt: string
  resolution: string
  aspectRatio: string
  referenceImages?: { dataUrl: string; sourceUrl?: string }[]
}) {
  selectedModelId.value = params.modelId
  resolution.value = params.resolution
  aspectRatio.value = params.aspectRatio
  userPrompt.value = params.prompt
  if (params.referenceImages?.length) {
    initSlots()
    let imgIdx = 0
    for (const slot of slots.value) {
      if (imgIdx >= params.referenceImages.length) break
      const count = Math.min(slot.maxCount, params.referenceImages.length - imgIdx)
      const images: SlotImage[] = []
      for (let i = 0; i < count; i++) {
        const img = params.referenceImages[imgIdx]
        images.push({
          id: `copy-${Date.now()}-${imgIdx}`,
          dataUrl: img.dataUrl,
          sourceUrl: img.sourceUrl,
        })
        imgIdx++
      }
      setSlotImages(slot.key, images)
    }
  }
}

defineExpose({ setParams })
</script>

<template>
  <div v-if="config" class="feature-form" v-loading="promptLoading">
    <div class="form-scroll-area">
      <!-- API Key warning -->
      <el-alert
        v-if="serverStatus.loaded && !serverStatus.sharedKeyConfigured"
        title="管理员尚未配置共享 API Key，生图功能暂不可用"
        type="warning"
        show-icon
        :closable="false"
        style="margin-bottom: 16px"
      />

      <!-- Prompt load error -->
      <el-alert
        v-if="promptError"
        title="提示词加载失败，将使用默认配置"
        type="info"
        show-icon
        :closable="false"
        style="margin-bottom: 16px"
      />

      <!-- Reference Images Section -->
      <div v-if="slots.length > 0" class="form-row-inline">
        <label class="form-label-left">上传图片</label>
        <div class="form-control-right">
          <div class="reference-slots">
            <ImageSlotUpload
              v-for="(slot, i) in slots" :key="slot.key"
              :label="slot.label"
              :max-count="slot.maxCount"
              :required="slot.required"
              :model-value="getSlotImages(slot.key)"
              :show-template-btn="i === 0"
              :starred-templates="[]"
              @update:model-value="setSlotImages(slot.key, $event)"
              @template-select="handleTemplateSelect(slot.key)"
              @starred-select="(t) => handleStarredSelect(slot.key, t)"
            />
          </div>
          <!-- Shared starred templates row spanning both slots -->
          <div
            v-if="starredTemplates.length > 0 && !allSlotsFull"
            class="starred-row-shared"
          >
            <div
              v-for="t in starredTemplates"
              :key="t.id"
              class="starred-thumb-shared"
              :title="t.name"
              @click="handleStarredSelect(slots[0].key, t)"
            >
              <img :src="t.public_url" :alt="t.name" />
            </div>
          </div>
        </div>
      </div>

      <!-- Supplementary Images -->
      <div v-if="config.hasSupplementaryImages" class="form-row-inline form-row-top">
        <label class="form-label-left">可选，最多5张，每张需要命名（如：领口、袖口、面料）</label>
        <div class="form-control-right">
          <SupplementaryImageUpload v-model="supplementaryImages" />
        </div>
      </div>

      <!-- User Prompt -->
      <div v-if="config.hasUserPrompt" class="form-row-inline form-row-top">
        <label class="form-label-left">{{ userPromptLabel }}</label>
        <div class="form-control-right">
          <el-input
            v-model="userPrompt"
            type="textarea"
            :rows="3"
            :placeholder="userPromptPlaceholder"
          />
        </div>
      </div>

      <!-- Model -->
      <div class="form-row-inline">
        <label class="form-label-left">模型</label>
        <div class="form-control-right">
          <el-select v-model="selectedModelId" style="width: 100%" @change="handleModelChange">
            <el-option v-for="m in MODELS" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </div>
      </div>

      <!-- Resolution -->
      <div class="form-row-inline">
        <label class="form-label-left">分辨率</label>
        <div class="form-control-right">
          <el-radio-group v-model="resolution" @change="handleResolutionChange">
            <el-radio-button v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</el-radio-button>
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
    </div>

    <!-- Footer -->
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

  <!-- Unknown feature fallback -->
  <div v-else class="placeholder-content">
    <span class="placeholder-text">未知功能</span>
    <span class="placeholder-hint">该功能尚未配置</span>
  </div>

  <!-- Template selector dialog -->
  <TemplateSelector
    v-model:visible="showTemplateSelector"
    :single="true"
    @select="handleTemplateConfirm"
  />
</template>

<style scoped>
.feature-form {
  height: 100%; display: flex; flex-direction: column;
}

.form-scroll-area {
  flex: 1; overflow-y: auto; min-height: 0;
  padding-bottom: 8px;
}

.reference-slots {
  display: flex; gap: 16px;
}
.reference-slots :deep(.slot-upload) {
  flex: 1; min-width: 0;
}

.starred-row-shared {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  overflow-x: auto;
  padding: 4px 0;
}
.starred-row-shared::-webkit-scrollbar {
  height: 4px;
}
.starred-row-shared::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 2px;
}
.starred-thumb-shared {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 2px solid var(--el-border-color-light);
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
}
.starred-thumb-shared:hover {
  border-color: var(--el-color-primary);
  transform: scale(1.08);
}
.starred-thumb-shared img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.form-row-inline {
  display: flex; align-items: flex-start; gap: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 14px; margin-bottom: 14px;
}

.form-row-top { align-items: flex-start; }

.form-label-left {
  width: 72px; flex-shrink: 0; text-align: right;
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-regular);
  padding-top: 6px;
}

.form-control-right {
  flex: 1; min-width: 0;
}

.form-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 16px;
}

.placeholder-content {
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
  color: var(--el-text-color-secondary);
}
.placeholder-text { font-size: var(--momo-font-size-xl); font-weight: 500; color: var(--el-text-color-regular); }
.placeholder-hint { font-size: var(--momo-font-size-base); }
</style>
