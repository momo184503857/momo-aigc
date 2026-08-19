<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ModelId } from '@/types/adapter'
import { formatCredits } from '@/types/adapter'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import { featurePromptApi } from '@/services/featurePromptApi'
import type { FeaturePromptItem } from '@/services/featurePromptApi'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import type { FeatureConfig } from '@/configs/featureConfig'
import { useUiFeedback } from '@/composables/useUiFeedback'
import PromptEditorPanel from './PromptEditorPanel.vue'
import ImageSlotUpload from './ImageSlotUpload.vue'
import type { SlotImage, StarredTemplate } from './ImageSlotUpload.vue'
import TemplateSelector from './TemplateSelector.vue'
import SupplementaryImageUpload from './SupplementaryImageUpload.vue'
import type { SupplementaryImage } from './SupplementaryImageUpload.vue'
import { templateApi } from '@/services/templateApi'
import { StarFilled } from '@element-plus/icons-vue'

const { warning } = useUiFeedback()

const props = defineProps<{ featureId: string }>()

const emit = defineEmits<{
  (e: 'generate', params: {
    channelModelId: number
    prompt: string
    resolution: string
    aspectRatio: string
    count: number
    refImages?: Array<{ url?: string; file?: File }>
    userPrompt: string
    systemPrompt: string
    supplementaryImages?: { name: string; url: string }[]
  }): void
}>()

const serverStatus = useServerStatusStore()
const modelCatalog = useModelCatalogStore()

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
const selectedChannelModelId = ref(0)
const resolution = ref('')
const aspectRatio = ref('')
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

// 当前会话内用户对系统提示词的修改，按 modelId 隔离；不持久化到服务器
const editedSystemPromptsByModel = ref<Record<string, string>>({})

// Model computed（必须在下方 promptKey 之前声明：watch(promptKey) 会在 setup 阶段
// 立即求值一次 getter，若 selectedModel 声明在后会命中 TDZ 报错导致整页白屏）
const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedChannelModelId.value))
const isPersonalChannel = computed(() => !!selectedModel.value?.mine)
const availableResolutions = computed(() => selectedModel.value?.capabilities?.resolutions || [])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return modelCatalog.aspectRatiosFor(selectedModel.value, resolution.value)
})
const currentPrice = computed(() => modelCatalog.priceFor(selectedModel.value, resolution.value) ?? 0)

const promptKey = computed(() => selectedModel.value?.logicalCode ?? selectedModel.value?.modelId ?? '')
const currentPrompt = computed(() => modelPrompts.value[promptKey.value])
const systemPrompt = computed(() => {
  const edited = editedSystemPromptsByModel.value[promptKey.value]
  if (edited !== undefined) return edited
  return currentPrompt.value?.system_prompt || ''
})
const userPromptLabel = computed(() => currentPrompt.value?.user_prompt_label || '补充提示词')
const userPromptPlaceholder = computed(() => currentPrompt.value?.user_prompt_placeholder || '')

// 提示词折叠面板绑定：单段系统提示词
const promptPanelModel = computed({
  get: () => ({ system: systemPrompt.value }),
  set: (val) => { editedSystemPromptsByModel.value[promptKey.value] = val.system },
})

const defaultPromptPanelModel = computed(() => ({ system: currentPrompt.value?.system_prompt || '' }))

function resetSystemPrompt() {
  editedSystemPromptsByModel.value[promptKey.value] = currentPrompt.value?.system_prompt || ''
}

async function fetchPrompts() {
  promptLoading.value = true
  promptError.value = false
  try {
    const res = await featurePromptApi.get(props.featureId)
    const items: FeaturePromptItem[] = res.data.data || []
    const map: Record<string, FeaturePromptItem> = {}
    items.forEach(item => { map[item.model_id] = item })
    modelPrompts.value = map
    // 若当前模型还没有本地编辑记录，初始化为后台默认值
    const key = promptKey.value
    if (key && editedSystemPromptsByModel.value[key] === undefined) {
      editedSystemPromptsByModel.value[key] = map[key]?.system_prompt || ''
    }
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

// 目录加载后应用默认模型/分辨率/宽高比（配置的默认模型名在目录中不存在时退回首项）
// 注意：必须在下方 immediate watch 之前声明，否则回调同步执行时会命中 TDZ 报错、整页白屏
const pendingDefaults = { modelName: '', resolution: '', aspectRatio: '' }

// Apply feature defaults from config
watch(config, (cfg) => {
  if (!cfg) return
  pendingDefaults.resolution = cfg.defaultResolution || ''
  pendingDefaults.aspectRatio = cfg.defaultAspectRatio || ''
  pendingDefaults.modelName = cfg.defaultModelId || ''
  applyDefaultsIfReady()
}, { immediate: true })

function applyDefaultsIfReady() {
  if (!modelCatalog.loaded || selectedChannelModelId.value) return
  const cm = modelCatalog.getModelByName(pendingDefaults.modelName) ?? modelCatalog.defaultImageModel
  if (!cm?.capabilities) return
  selectedChannelModelId.value = cm.id
  resolution.value = cm.capabilities.resolutions.includes(pendingDefaults.resolution)
    ? pendingDefaults.resolution
    : cm.capabilities.resolutions[0]
  const ratios = modelCatalog.aspectRatiosFor(cm, resolution.value)
  aspectRatio.value = ratios.includes(pendingDefaults.aspectRatio) ? pendingDefaults.aspectRatio : ratios[0]
}
modelCatalog.ensureLoaded().then(() => applyDefaultsIfReady())

// 切换模型时，若提示词已加载且该模型还没有本地编辑记录，则初始化为后台默认值
watch(promptKey, (key) => {
  if (!key || Object.keys(modelPrompts.value).length === 0) return
  if (editedSystemPromptsByModel.value[key] === undefined) {
    editedSystemPromptsByModel.value[key] = modelPrompts.value[key]?.system_prompt || ''
  }
})

// Model change: reset resolution/aspect to valid values
function handleModelChange() {
  const model = selectedModel.value
  if (model?.capabilities) {
    if (!model.capabilities.resolutions.includes(resolution.value)) {
      resolution.value = model.capabilities.resolutions[0]
    }
    aspectRatio.value = modelCatalog.aspectRatiosFor(model, resolution.value)[0]
  }
}

function handleResolutionChange() {
  const model = selectedModel.value
  if (model) {
    const ratios = modelCatalog.aspectRatiosFor(model, resolution.value)
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
  if (!serverStatus.canGenerate) return false
  if (!selectedChannelModelId.value) return false
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

  const refImages: Array<{ url?: string; file?: File }> = []

  config.value?.imageSlots.forEach(slot => {
    const images = getSlotImages(slot.key)
    images.forEach(img => {
      if (img.sourceUrl) {
        refImages.push({ url: img.sourceUrl })
      } else if (img.file) {
        refImages.push({ file: img.file })
      } else {
        refImages.push({ url: img.dataUrl })
      }
    })
  })

  emit('generate', {
    channelModelId: selectedChannelModelId.value,
    prompt: buildFullPrompt(),
    resolution: resolution.value,
    aspectRatio: aspectRatio.value,
    count: count.value,
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
  modelId: string
  prompt: string
  resolution: string
  aspectRatio: string
  referenceImages?: { dataUrl: string; sourceUrl?: string }[]
  supplementaryImages?: { name: string; url: string }[]
}) {
  // 旧参数携带模型名字符串：按名反查渠道模型（兼容历史任务「复制参数」）
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
  // 恢复补充图片（细节图等）
  if (params.supplementaryImages?.length) {
    supplementaryImages.value = params.supplementaryImages.map((img, i) => ({
      id: `copy-supp-${Date.now()}-${i}`,
      dataUrl: img.url,
      name: img.name,
      sourceUrl: img.url,
    }))
  }
}

defineExpose({ setParams })
</script>

<template>
  <div v-if="config" class="feature-form" v-loading="promptLoading">
    <div class="form-scroll-area">
      <!-- API Key warning -->
      <el-alert
        v-if="serverStatus.loaded && !serverStatus.canGenerate"
        title="暂无可用模型（平台渠道未配置或已停用），请联系管理员或前往「我的渠道」配置个人渠道"
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
          <!-- 收藏模板行（始终显示，横跨两个槽位） -->
          <div class="starred-row-shared">
            <!-- 有收藏：缩略图 -->
            <div
              v-for="t in starredTemplates"
              :key="t.id"
              class="starred-thumb-shared"
              :title="t.name"
              @click="handleStarredSelect(slots[0].key, t)"
            >
              <img :src="t.public_url" :alt="t.name" />
            </div>

            <!-- 无收藏：空状态占位 -->
            <span v-if="starredTemplates.length === 0" class="starred-empty">
              还没有收藏的模板
            </span>

            <!-- 引导：始终在行末尾，点击跳转模板图库添加收藏 -->
            <router-link to="/templates" class="starred-guide">
              <el-icon><StarFilled /></el-icon>
              <span class="starred-guide-title">收藏模板</span>
              <span class="starred-guide-link">去模板图库添加 ›</span>
            </router-link>
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

      <!-- Prompt Editor Panel -->
      <div class="prompt-panel-row">
        <PromptEditorPanel
          v-model="promptPanelModel"
          title="查看/编辑完整提示词"
          :sections="[{ key: 'system', label: '系统提示词' }]"
          :final-prompt="buildFullPrompt()"
          :default-value="defaultPromptPanelModel"
          :rows="4"
          @reset="resetSystemPrompt"
        />
      </div>

      <!-- Model -->
      <div class="form-row-inline">
        <label class="form-label-left">模型</label>
        <div class="form-control-right">
          <el-select v-model="selectedChannelModelId" style="width: 100%" @change="handleModelChange">
            <template v-if="modelCatalog.loaded">
              <template v-for="group in modelCatalog.imageGroups" :key="group.providerId">
                <el-option-group :label="group.mine ? `我的渠道 · ${group.providerName}` : group.providerName">
                  <el-option
                    v-for="m in group.models"
                    :key="m.id"
                    :label="group.mine ? `${m.displayName}（个人）` : m.displayName"
                    :value="m.id"
                  />
                </el-option-group>
              </template>
            </template>
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
        {{ isPersonalChannel ? '生成图片 · 个人渠道 · 不扣积分' : `生成图片 · ${formatCredits(currentPrice)}` }}
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

.starred-guide {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 2px dashed var(--el-border-color);
  border-radius: var(--momo-radius-sm);
  color: var(--el-text-color-secondary);
  text-align: center;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;
}
.starred-guide:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.starred-guide .el-icon { font-size: 20px; }
.starred-guide-title { font-size: var(--momo-font-size-sm); font-weight: 500; }
.starred-guide-link { font-size: var(--momo-font-size-xs); }

.starred-empty {
  flex-shrink: 0;
  align-self: center;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
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

.prompt-panel-row {
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.placeholder-content {
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
  color: var(--el-text-color-secondary);
}
.placeholder-text { font-size: var(--momo-font-size-xl); font-weight: 500; color: var(--el-text-color-regular); }
.placeholder-hint { font-size: var(--momo-font-size-base); }
</style>
