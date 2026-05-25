<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ModelId } from '@/types/adapter'
import { MODELS, DEFAULT_MODEL, DEFAULT_RESOLUTION, DEFAULT_ASPECT_RATIO, getAspectRatios, getPrice } from '@/types/adapter'
import { useKeyConfigStore } from '@/stores/keyConfig'
import { featurePromptApi } from '@/services/featurePromptApi'
import type { FeaturePromptItem } from '@/services/featurePromptApi'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import type { FeatureConfig } from '@/configs/featureConfig'
import ImageSlotUpload from './ImageSlotUpload.vue'
import type { SlotImage } from './ImageSlotUpload.vue'
import TemplateSelector from './TemplateSelector.vue'

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
  }): void
}>()

const keyStore = useKeyConfigStore()

// Feature config
const config = computed<FeatureConfig | undefined>(() => FEATURE_CONFIGS[props.featureId])

const referenceSlots = computed(() => config.value?.imageSlots.filter(s => s.section === 'reference') || [])
const supplementarySlots = computed(() => config.value?.imageSlots.filter(s => s.section === 'supplementary') || [])

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

// Template selector state
const showTemplateSelector = ref(false)
const templateTargetSlot = ref('')

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

onMounted(() => fetchPrompts())

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
const canGenerate = computed(() => {
  if (!keyStore.hasKey) return false
  if (!config.value) return false
  for (const slot of config.value.imageSlots) {
    if (slot.required && getSlotImages(slot.key).length === 0) return false
  }
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
  const templateUrls: string[] = []
  const tempImageFiles: File[] = []

  config.value?.imageSlots.forEach(slot => {
    const images = getSlotImages(slot.key)
    images.forEach(img => {
      if (img.sourceUrl) {
        templateUrls.push(img.sourceUrl)
      } else if (img.file) {
        tempImageFiles.push(img.file)
      } else {
        templateUrls.push(img.dataUrl)
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
  const remaining = slot.maxCount - existing.length
  if (remaining <= 0) return
  const toAdd = templates.slice(0, remaining)
  const newImages: SlotImage[] = toAdd.map((t, i) => ({
    id: `tpl-${Date.now()}-${i}`,
    dataUrl: t.previewUrl || t.url,
    sourceUrl: t.url,
  }))
  setSlotImages(slotKey, [...existing, ...newImages])
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
    // Put all images into the first reference slot
    const firstRefSlot = referenceSlots.value[0]
    if (firstRefSlot) {
      const images: SlotImage[] = params.referenceImages.map((img, i) => ({
        id: `copy-${Date.now()}-${i}`,
        dataUrl: img.dataUrl,
        sourceUrl: img.sourceUrl,
      }))
      setSlotImages(firstRefSlot.key, images.slice(0, firstRefSlot.maxCount))
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
        v-if="!keyStore.hasKey"
        title="请先设置 ToAPIs API Key 才能生成图片"
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
      <div v-if="referenceSlots.length > 0" class="form-row-inline">
        <label class="form-label-left">上传图片</label>
        <div class="form-control-right">
          <div class="reference-slots">
            <ImageSlotUpload
              v-for="slot in referenceSlots" :key="slot.key"
              :label="slot.label"
              :max-count="slot.maxCount"
              :required="slot.required"
              :model-value="getSlotImages(slot.key)"
              :show-template-btn="slot.key === 'model'"
              @update:model-value="setSlotImages(slot.key, $event)"
              @template-select="handleTemplateSelect(slot.key)"
            />
          </div>
        </div>
      </div>

      <!-- Supplementary Images Section -->
      <div v-if="supplementarySlots.length > 0" class="form-row-inline">
        <label class="form-label-left">补充图片</label>
        <div class="form-control-right">
          <ImageSlotUpload
            v-for="slot in supplementarySlots" :key="slot.key"
            :label="slot.label"
            :max-count="slot.maxCount"
            :required="slot.required"
            :size="60"
            :align-left="true"
            :model-value="getSlotImages(slot.key)"
            @update:model-value="setSlotImages(slot.key, $event)"
          />
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

.form-row-inline {
  display: flex; align-items: flex-start; gap: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 14px; margin-bottom: 14px;
}

.form-row-top { align-items: flex-start; }

.form-label-left {
  width: 72px; flex-shrink: 0; text-align: right;
  font-size: 13px; color: var(--el-text-color-regular);
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
.placeholder-text { font-size: 18px; font-weight: 500; color: var(--el-text-color-regular); }
.placeholder-hint { font-size: 14px; }
</style>
