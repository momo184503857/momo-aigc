<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
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
import ModelChannelSelect from './ModelChannelSelect.vue'
import SupplementaryImageUpload from './SupplementaryImageUpload.vue'
import type { SupplementaryImage } from './SupplementaryImageUpload.vue'
import { templateApi } from '@/services/templateApi'
import { Star, TriangleAlert, Info, LoaderCircle, Wand2, LayoutTemplate, CircleHelp } from '@lucide/vue'
import { Button } from '@/components/design-system/primitives/button'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { Alert, AlertTitle } from '@/components/design-system/primitives/alert'
import { Badge } from '@/components/design-system/primitives/badge'
import { DsParameterPanel } from '@/components/design-system'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/design-system/primitives/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/design-system/primitives/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/design-system/primitives/select'

const { warning } = useUiFeedback()

const props = defineProps<{ featureId: string }>()

const emit = defineEmits<{
  (e: 'generate', params: {
    logicalModelId: number
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
const selectedModelId = ref(0)
const resolution = ref('')
const aspectRatio = ref('')
const count = ref(1)
const userPrompt = ref('')

// Supplementary images
const supplementaryImages = ref<SupplementaryImage[]>([])

// Template selector state
const showTemplateSelector = ref(false)
const templateTargetSlot = ref('')
const starredOpen = ref(false)

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

// Prompts from server（每功能一条，不再按模型区分）
const promptLoading = ref(false)
const promptError = ref(false)
const featurePrompt = ref<FeaturePromptItem | null>(null)

// 当前会话内用户对系统提示词的修改；不持久化到服务器
const editedSystemPrompt = ref<string | undefined>(undefined)

// Model computed（必须在依赖它的下方 computed 之前声明，否则 setup 阶段
// 立即求值 getter 时会命中 TDZ 报错导致整页白屏）
const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedModelId.value))
const availableResolutions = computed(() => selectedModel.value?.capabilities?.resolutions || [])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return modelCatalog.aspectRatiosFor(selectedModel.value, resolution.value)
})
const currentPrice = computed(() => modelCatalog.priceFor(selectedModel.value, resolution.value))
/** 按钮文案：显示本次预计消耗（积分，×张数） */
const generateButtonLabel = computed(() => {
  return `生成图片 · ${formatCredits((currentPrice.value ?? 0) * count.value)}`
})

const systemPrompt = computed(() => editedSystemPrompt.value ?? featurePrompt.value?.system_prompt ?? '')
const userPromptLabel = computed(() => featurePrompt.value?.user_prompt_label || '补充提示词')
const userPromptPlaceholder = computed(() => featurePrompt.value?.user_prompt_placeholder || '')

// 提示词折叠面板绑定：单段系统提示词
const promptPanelModel = computed({
  get: () => ({ system: systemPrompt.value }),
  set: (val) => { editedSystemPrompt.value = val.system },
})

const defaultPromptPanelModel = computed(() => ({ system: featurePrompt.value?.system_prompt || '' }))

function resetSystemPrompt() {
  editedSystemPrompt.value = featurePrompt.value?.system_prompt || ''
}

async function fetchPrompts() {
  promptLoading.value = true
  promptError.value = false
  try {
    const res = await featurePromptApi.get(props.featureId)
    const item: FeaturePromptItem | null = res.data.data || null
    featurePrompt.value = item
    // 首次加载时用后台默认值初始化本地编辑缓存
    if (editedSystemPrompt.value === undefined) {
      editedSystemPrompt.value = item?.system_prompt || ''
    }
  } catch {
    promptError.value = true
    featurePrompt.value = null
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
  if (!modelCatalog.loaded || selectedModelId.value) return
  const cm = modelCatalog.getModelByName(pendingDefaults.modelName) ?? modelCatalog.defaultImageModel
  if (!cm?.capabilities) return
  selectedModelId.value = cm.id
  resolution.value = cm.capabilities.resolutions.includes(pendingDefaults.resolution)
    ? pendingDefaults.resolution
    : cm.capabilities.resolutions[0]
  const ratios = modelCatalog.aspectRatiosFor(cm, resolution.value)
  aspectRatio.value = ratios.includes(pendingDefaults.aspectRatio) ? pendingDefaults.aspectRatio : ratios[0]
}
modelCatalog.ensureLoaded().then(() => applyDefaultsIfReady())

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
  if (!selectedModelId.value) return false
  for (const slot of config.value.imageSlots) {
    if (slot.required && getSlotImages(slot.key).length === 0) return false
  }
  // 检查补充图片是否都已命名
  if (supplementaryImages.value.some(img => !img.name.trim())) return false
  return true
})

// 仅 UI：把 canGenerate 的判定原因显性化，避免"按钮为什么是灰的"
const blockingHint = computed(() => {
  if (!serverStatus.loaded) return '正在检查服务状态…'
  if (!serverStatus.canGenerate) return '暂无可用模型渠道，请联系管理员配置'
  const missing = (config.value?.imageSlots || [])
    .filter(s => s.required && getSlotImages(s.key).length === 0)
    .map(s => s.label)
  if (missing.length) return `还需上传：${missing.join('、')}`
  if (supplementaryImages.value.some(img => !img.name.trim())) return '请为所有补充图片命名'
  if (!selectedModelId.value) return '请选择生成模型'
  return ''
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
    logicalModelId: selectedModelId.value,
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

// 仅 UI：弹层内选完收藏模板后收起
function pickStarred(template: StarredTemplate) {
  if (!slots.value.length) return
  handleStarredSelect(slots.value[0].key, template)
  starredOpen.value = false
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
  <div
    v-if="config"
    class="relative flex h-full min-h-0 flex-col"
    @keydown.meta.enter="canGenerate && handleGenerate()"
    @keydown.ctrl.enter="canGenerate && handleGenerate()"
  >
    <div v-if="promptLoading" class="bg-background/60 absolute inset-0 z-10 flex items-center justify-center">
      <LoaderCircle class="text-muted-foreground size-6 animate-spin" />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <!-- API Key warning -->
      <Alert v-if="serverStatus.loaded && !serverStatus.canGenerate" variant="warning" class="mb-4">
        <TriangleAlert />
        <AlertTitle>暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型</AlertTitle>
      </Alert>

      <!-- Prompt load error -->
      <Alert v-if="promptError" class="mb-4">
        <Info />
        <AlertTitle>提示词加载失败，将使用默认配置</AlertTitle>
      </Alert>

      <!-- ① 参考图与细节补充 -->
      <section v-if="slots.length > 0 || config.hasSupplementaryImages" class="pb-5">
        <div v-if="slots.length > 0" class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <h2 class="text-sm font-semibold">
              参考图
              <span class="text-muted-foreground ml-1.5 font-normal">
                {{ slots.length }} 张 · 支持拖拽图片到框内
              </span>
            </h2>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <Popover v-model:open="starredOpen">
              <PopoverTrigger as-child>
                <Button size="sm" variant="ghost" class="gap-1.5">
                  <Star class="size-3.5" />
                  收藏模板
                  <Badge v-if="starredTemplates.length" variant="secondary" class="ml-0.5 h-4 px-1">
                    {{ starredTemplates.length }}
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" class="w-88 p-3">
                <p class="text-muted-foreground mb-2 text-sm font-medium tracking-wider uppercase">
                  收藏模板
                </p>
                <div v-if="starredTemplates.length" class="max-h-64 grid grid-cols-4 gap-2 overflow-y-auto">
                  <Button variant="ghost"
                    v-for="t in starredTemplates"
                    :key="t.id"
                    type="button"
                    :title="t.name"
                    class="hover:border-primary aspect-square cursor-pointer overflow-hidden border border-border transition-colors"
                    @click="pickStarred(t)"
                  >
                    <img :src="t.public_url" :alt="t.name" class="size-full object-cover" />
                  </Button>
                </div>
                <p v-else class="text-muted-foreground py-6 text-center text-sm">
                  还没有收藏的模板
                </p>
                <div class="mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
                  <span class="text-muted-foreground text-sm">点击即填入第一个参考图位</span>
                  <RouterLink to="/templates" class="text-sm text-primary hover:underline">
                    去模板图库收藏 ›
                  </RouterLink>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="ghost"
              class="gap-1.5"
              @click="handleTemplateSelect(slots[0].key)"
            >
              <Wand2 class="size-3.5" />
              模板库
            </Button>
          </div>
        </div>

        <div class="flex flex-wrap items-start gap-4">
          <ImageSlotUpload
            v-for="slot in slots" :key="slot.key"
            :label="slot.label"
            :max-count="slot.maxCount"
            :required="slot.required"
            :model-value="getSlotImages(slot.key)"
            :show-template-btn="false"
            :starred-templates="starredTemplates"
            show-starred-on-hover
            :size="164"
            align-left
            @update:model-value="setSlotImages(slot.key, $event)"
            @starred-select="handleStarredSelect(slot.key, $event)"
          />
          <div v-if="config.hasSupplementaryImages" class="min-w-40 flex-1">
            <div class="mb-3 flex items-center gap-1">
              <h2 class="text-sm font-semibold">细节补充</h2>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button variant="ghost" size="icon-xs" aria-label="细节补充说明">
                    <CircleHelp class="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  可选，最多 5 张，每张需命名（如：领口、袖口、面料）
                </TooltipContent>
              </Tooltip>
            </div>
            <SupplementaryImageUpload v-model="supplementaryImages" />
          </div>
        </div>
      </section>

      <!-- ② 生成描述 -->
      <section v-if="config.hasUserPrompt" class="pb-3">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">{{ userPromptLabel }}</h2>
          <span class="text-muted-foreground text-sm tabular-nums">{{ userPrompt.length }} 字</span>
        </div>
        <Textarea
          v-model="userPrompt"
          :rows="3"
          :placeholder="userPromptPlaceholder"
        />
      </section>

      <!-- ③ 提示词（高级，默认收起） -->
      <section class="pb-1">
        <PromptEditorPanel
          v-model="promptPanelModel"
          title="查看/编辑完整提示词"
          :sections="[{ key: 'system', label: '系统提示词' }]"
          :final-prompt="buildFullPrompt()"
          :default-value="defaultPromptPanelModel"
          :rows="4"
          @reset="resetSystemPrompt"
        />
      </section>
    </div>

    <div class="bg-background shrink-0 border-t px-5 py-3">
      <DsParameterPanel :label="generateButtonLabel" :disabled="!canGenerate" :reason="blockingHint || undefined" reason-tone="error" @submit="handleGenerate">
        <div class="ds-parameter">
          <span class="ds-caption">模型</span>
          <ModelChannelSelect v-model="selectedModelId" aria-label="模型" content-position="popper" @change="handleModelChange" />
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">画面比例</span>
          <Select :model-value="aspectRatio" @update:model-value="(v) => (aspectRatio = String(v))">
            <SelectTrigger aria-label="画面比例"><SelectValue placeholder="选择宽高比" /></SelectTrigger>
            <SelectContent position="popper"><SelectItem v-for="ar in availableAspectRatios" :key="ar" :value="ar">{{ ar }}</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">生成数量</span>
          <Select :model-value="String(count)" @update:model-value="(v) => (count = Number(v))">
            <SelectTrigger aria-label="生成数量"><SelectValue /></SelectTrigger>
            <SelectContent position="popper"><SelectItem v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="String(n)">{{ n }} 张</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">分辨率</span>
          <Select :model-value="resolution" @update:model-value="(v) => { resolution = String(v); handleResolutionChange() }">
            <SelectTrigger aria-label="分辨率"><SelectValue placeholder="选择分辨率" /></SelectTrigger>
            <SelectContent position="popper"><SelectItem v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</SelectItem></SelectContent>
          </Select>
        </div>
      </DsParameterPanel>
    </div>
  </div>

  <!-- Unknown feature fallback -->
  <div v-else class="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
    <span class="text-foreground/80 text-xl font-medium">未知功能</span>
    <span class="text-sm">该功能尚未配置</span>
  </div>

  <!-- Template selector dialog -->
  <TemplateSelector
    v-model:visible="showTemplateSelector"
    :single="true"
    @select="handleTemplateConfirm"
  />
</template>
