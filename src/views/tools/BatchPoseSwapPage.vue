<script setup lang="ts">
import DsThumbnail from '@/components/design-system/composites/DsThumbnail.vue'
import { useGenerationModelOptions } from '@/composables/useGenerationModelOptions'
const generationModels = useGenerationModelOptions()
import { SHOW_PROMPT_EDITOR_ENTRY } from '@/configs/uiFeatures'
/**
 * 批量换衣服（模特图 × 1  +  衣服图 × N）
 *
 * 结构：批量素材单行横向滚动，共用素材紧邻右侧；底栏依次为补充提示词、批量摘要和生成参数。
 * 提交循环本身未改动，只额外镜像了 4 个纯视图进度状态（isSubmitting / submitCursor /
 * submitDone / submitFailedAt），用于逐张进度反馈。
 */
import { ref, computed, watch, onMounted } from 'vue'
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ChevronDown, ChevronUp, CircleHelp, CircleCheck, CircleX, LoaderCircle, Minus, TriangleAlert } from '@lucide/vue'
import { useUiFeedback, confirmDialog } from '@/composables/useUiFeedback'
import { useServerStatusStore } from '@/stores/serverStatus'
import { featurePromptApi } from '@/services/featurePromptApi'
import type { FeaturePromptItem } from '@/services/featurePromptApi'
import { pointsApi } from '@/services/pointsApi'
import { submitTask } from '@/services/imageGeneration'
import { ossApi } from '@/services/ossApi'
import { translateError } from '@/utils/errors'
import { formatCredits } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import type { ModelId } from '@/types/adapter'
import { DsParameterPanel, DsScrollPage as PageLayout, TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/design-system'
import PromptEditorPanel from '@/components/PromptEditorPanel.vue'
import ImageSlotUpload from '@/components/ImageSlotUpload.vue'
import type { SlotImage } from '@/components/ImageSlotUpload.vue'
import { Alert, AlertTitle } from '@/components/design-system/primitives/alert'
import { Badge } from '@/components/design-system/primitives/badge'
import { Button } from '@/components/design-system/primitives/button'
import { Progress } from '@/components/design-system/primitives/progress'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { cn } from '@/lib/utils'

const summaryExpanded = ref(false)
const userPromptExpanded = ref(false)
const router = useRouter()
const { success, warning, error } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Images ───

const modelImages = ref<SlotImage[]>([])
// 缩略图保持单行，共用素材紧邻右侧，超宽时仅批量区横向滚动。
const batchStripWidth = computed(() => Math.max(160, Math.min(garmentImages.value.length + 1, 100) * 130 - 10))
const garmentImages = ref<SlotImage[]>([])

// ─── Prompt ───

const promptLoading = ref(false)
const featurePrompt = ref<FeaturePromptItem | null>(null)
const userPrompt = ref('')

// 当前会话内用户对系统提示词的修改；不持久化到服务器
const editedSystemPrompt = ref<string | undefined>(undefined)

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

// ─── Model / Resolution / Aspect Ratio ───

const modelCatalog = useModelCatalogStore()
const selectedModelId = ref(0)
const resolution = ref('')
const aspectRatio = ref('')

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

const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedModelId.value))
const availableResolutions = computed(() => selectedModel.value?.capabilities?.resolutions || [])
const availableAspectRatios = computed(() => {
  if (!selectedModel.value) return ['1:1']
  return modelCatalog.aspectRatiosFor(selectedModel.value, resolution.value)
})
const unitPrice = computed(() => modelCatalog.priceFor(selectedModel.value, resolution.value) ?? 0)

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

// ─── Validation ───

const canGenerate = computed(() => {
  if (!serverStatus.loaded) return false
  if (!serverStatus.canGenerate) return false
  if (!selectedModelId.value) return false
  if (modelImages.value.length === 0) return false
  if (garmentImages.value.length === 0) return false
  return true
})

const taskCount = computed(() => garmentImages.value.length)
const totalCost = computed(() => Math.round(unitPrice.value * taskCount.value * 1000) / 1000)

// ─── 提交进度（纯视图状态，不参与任何业务判定） ───

const isSubmitting = ref(false)
const submitCursor = ref(-1)
const submitDone = ref(0)
const submitFailedAt = ref(-1)

/** 素材变化即视为新的一批，清空上一轮的进度显示 */
watch([modelImages, garmentImages], () => {
  if (isSubmitting.value) return
  submitCursor.value = -1
  submitDone.value = 0
  submitFailedAt.value = -1
})

const hasSubmitRun = computed(() => isSubmitting.value || submitDone.value > 0 || submitFailedAt.value >= 0)
const submitPercent = computed(() =>
  taskCount.value === 0 ? 0 : Math.round((submitDone.value / taskCount.value) * 100),
)
const submitSummary = computed(() => {
  if (isSubmitting.value) return `正在提交第 ${submitCursor.value + 1} / ${taskCount.value} 张`
  if (submitFailedAt.value >= 0) return `已提交 ${submitDone.value} 个任务，第 ${submitFailedAt.value + 1} 张失败后停止`
  if (submitDone.value > 0) return `已提交 ${submitDone.value} 个任务`
  return ''
})

type ItemState = 'pending' | 'active' | 'done' | 'failed' | 'skipped'
function itemState(i: number): ItemState {
  if (!hasSubmitRun.value) return 'pending'
  if (i === submitFailedAt.value) return 'failed'
  if (i < submitDone.value) return 'done'
  if (isSubmitting.value && i === submitCursor.value) return 'active'
  if (submitFailedAt.value >= 0 && i > submitFailedAt.value) return 'skipped'
  return 'pending'
}

const ITEM_STATE_META: Record<ItemState, { label: string; icon: Component; class: string }> = {
  pending: { label: '等待中', icon: Minus, class: 'text-muted-foreground/60' },
  active: { label: '提交中', icon: LoaderCircle, class: 'text-warning' },
  done: { label: '已提交', icon: CircleCheck, class: 'text-success' },
  failed: { label: '失败', icon: CircleX, class: 'text-destructive' },
  skipped: { label: '未提交', icon: Minus, class: 'text-muted-foreground/60' },
}

/** 缩略图旁的文件名（仅展示，缺失时退回链接尾段或序号） */
function imageName(img: SlotImage, i: number): string {
  if (img.file?.name) return img.file.name
  const src = img.sourceUrl || img.dataUrl || ''
  if (/^data:/.test(src)) return `本地图片 ${i + 1}`
  const tail = src.split('?')[0].split('/').pop()
  return tail || `图片 ${i + 1}`
}

// 仅 UI：把 canGenerate 的判定原因显性化，避免「按钮为什么是灰的」
const blockingHint = computed(() => {
  if (!serverStatus.loaded) return '正在检查服务状态…'
  if (!serverStatus.canGenerate) return '暂无可用模型渠道，请联系管理员配置'
  if (!selectedModelId.value) return '请选择生成模型'
  if (modelImages.value.length === 0) return '请上传 1 张模特图'
  if (garmentImages.value.length === 0) return '请上传至少 1 张衣服图'
  return ''
})

// ─── Fetch prompts ───

async function fetchPrompts() {
  promptLoading.value = true
  try {
    const res = await featurePromptApi.get('change-clothes')
    const item: FeaturePromptItem | null = res.data.data || null
    featurePrompt.value = item
    if (editedSystemPrompt.value === undefined) {
      editedSystemPrompt.value = item?.system_prompt || ''
    }
  } catch {
    featurePrompt.value = null
  } finally {
    promptLoading.value = false
  }
}

// ─── Build prompt ───

function buildFullPrompt(): string {
  const sys = systemPrompt.value
  const user = userPrompt.value.trim()
  if (!sys.includes('{user_prompt}')) {
    return user ? `${sys}\n${user}` : sys
  }
  return sys.replace(/\{user_prompt\}/g, user || '')
}

// ─── Upload helper ───

/** 将 SlotImage 解析为 OSS URL（本地文件先上传一次），供循环复用 */
async function resolveSlotUrl(img: SlotImage): Promise<string> {
  if (img.sourceUrl) return img.sourceUrl
  if (img.file) return (await ossApi.upload(img.file, 'inputs')).publicUrl
  return img.dataUrl
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Generate ───

async function handleGenerate() {
  if (!canGenerate.value) return

  const count = taskCount.value
  const total = totalCost.value

  try {
    await confirmDialog(
      `模特图：1 张\n衣服图：${count} 张\n任务数量：${count} 个\n预计消耗：${formatCredits(total)}`,
      '确认提交',
      { confirmText: '确认提交', cancelText: '取消' }
    )
  } catch {
    return // cancelled
  }

  // 纯视图：进入逐张进度反馈
  isSubmitting.value = true
  submitCursor.value = -1
  submitDone.value = 0
  submitFailedAt.value = -1

  try {
    // 余额预检（服务端仍会二次校验）
    try {
      const res = await pointsApi.getMyBalance()
      const balance = res.data.data?.balance ?? 0
      if (balance < total) {
        warning(`积分不足，需要 ${formatCredits(total)}，当前余额 ${formatCredits(balance)}`)
        return
      }
    } catch { /* proceed, server will check */ }

    const prompt = buildFullPrompt()
    // 模特图（所有任务共用）：循环外解析为 OSS URL 一次，避免重复上传
    const modelUrl = await resolveSlotUrl(modelImages.value[0])

    let submitted = 0
    let failed = false

    for (let i = 0; i < garmentImages.value.length; i++) {
      const garmentImg = garmentImages.value[i]
      submitCursor.value = i
      try {
        const garmentUrl = await resolveSlotUrl(garmentImg)

        // 调用统一入口 submitTask
        await submitTask({
          logicalModelId: selectedModelId.value,
          prompt,
          size: aspectRatio.value,
          resolution: resolution.value,
          refImages: [{ url: modelUrl }, { url: garmentUrl }],
          featureId: 'change-clothes',
          userPrompt: userPrompt.value.trim(),
        })

        submitted++
        submitDone.value = submitted
        window.dispatchEvent(new CustomEvent('canvas:task-created'))

        if (i < garmentImages.value.length - 1) {
          await sleep(3000)
        }
      } catch (e: any) {
        submitFailedAt.value = i
        if (e?.response?.status === 402) {
          warning(e.response.data?.error || '积分不足，已停止提交')
          failed = true
          break
        }
        const msg = e?.response?.data?.error || translateError(e)
        error(`第 ${i + 1} 张提交失败：${msg}`)
        failed = true
        break
      }
    }

    if (submitted > 0) {
      success(`成功提交 ${submitted} 个任务${failed ? '，部分任务未提交' : ''}`)
    }
  } finally {
    // 纯视图：无论以何种方式结束都退出提交中状态
    isSubmitting.value = false
    submitCursor.value = -1
  }
}

// ─── Init ───

onMounted(() => {
  serverStatus.fetchStatus()
  fetchPrompts()
})
</script>

<template>
  <PageLayout :dividers="false" inset-content>
    <template #actions>
      <Button variant="ghost" size="icon-sm" aria-label="返回工具箱" @click="router.push('/toolbox')">
        <ArrowLeft class="size-4" />
      </Button>
    </template>

    <!-- API Key warning -->
    <Alert v-if="serverStatus.loaded && !serverStatus.canGenerate" variant="warning" class="content-max mb-4">
      <TriangleAlert />
      <AlertTitle>暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型</AlertTitle>
    </Alert>

    <div class="content-max flex min-w-0 flex-wrap items-start gap-x-8 gap-y-6">
      <!-- 衣服图区按内容增长，到可用宽度上限后横向滚动。 -->
      <div class="min-w-0" :style="{ width: `min(100%, ${batchStripWidth}px)`, maxWidth: 'max(160px, calc(100% - 152px))' }">
        <!-- ① 衣服图（批量源） -->
        <section class="border-border pb-6">
          <div class="mb-2.5 flex flex-wrap items-center gap-2">
            <h3 class="flex items-center gap-1 text-sm font-semibold">
              衣服图
              <TooltipProvider :delay-duration="200">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button variant="ghost" size="icon-xs" aria-label="衣服图上传说明"><CircleHelp /></Button>
                  </TooltipTrigger>
                  <TooltipContent>必填 · 每张生成 1 个任务，最多 100 张，可直接拖图</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h3>
            <Badge variant="outline" class="h-4 shrink-0 px-1.5 tabular-nums">
              {{ garmentImages.length }} / 100
            </Badge>
          </div>
          <ImageSlotUpload
            label=""
            :max-count="100"
            single-row
            use-object-urls
            :required="true"
            :model-value="garmentImages"
            :size="120"
            align-left
            @update:model-value="garmentImages = $event"
          />
        </section>

        <!-- ② 提交明细（仅提交过程中/提交后出现） -->
        <section v-if="hasSubmitRun" class="border-border border-t pt-4">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">
              提交明细
              <span class="text-muted-foreground ml-1.5 font-normal">任务已进入全局任务面板</span>
            </h3>
            <span class="text-muted-foreground text-sm tabular-nums">
              {{ submitDone }} / {{ taskCount }}
            </span>
          </div>
          <ul class="divide-border max-h-72 divide-y overflow-y-auto rounded-md border">
            <li
              v-for="(img, i) in garmentImages"
              :key="img.id"
              class="flex items-center gap-2.5 px-2 py-1.5"
            >
              <span class="text-muted-foreground w-5 shrink-0 text-right text-sm tabular-nums">
                {{ i + 1 }}
              </span>
              <DsThumbnail :src="img.dataUrl" class="media-tile size-8 shrink-0" :alt="imageName(img, i)" />
              <span class="text-foreground/90 min-w-0 flex-1 truncate text-sm">
                {{ imageName(img, i) }}
              </span>
              <span
                class="flex shrink-0 items-center gap-1 text-sm"
                :class="ITEM_STATE_META[itemState(i)].class"
              >
                <component
                  :is="ITEM_STATE_META[itemState(i)].icon"
                  :class="cn('size-3.5', itemState(i) === 'active' && 'animate-spin')"
                />
                {{ ITEM_STATE_META[itemState(i)].label }}
              </span>
            </li>
          </ul>
        </section>

      </div>

      <!-- 右栏：共用素材 -->
      <aside class="flex w-30 min-w-0 shrink-0 flex-col gap-6">
        <section>
          <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 class="flex items-center gap-1 text-sm font-semibold">
              模特图
              <TooltipProvider :delay-duration="200">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button variant="ghost" size="icon-xs" aria-label="模特图上传说明"><CircleHelp /></Button>
                  </TooltipTrigger>
                  <TooltipContent>必填 · 所有任务共用</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h3>
          </div>
          <ImageSlotUpload
            label=""
            :max-count="1"
            :required="true"
            :model-value="modelImages"
            :size="120"
            align-left
            @update:model-value="modelImages = $event"
          />
        </section>

      </aside>

    </div>

    <!-- 统一参数与吸底操作栏 -->
    <template #footer>
      <!-- 补充提示词位于批量摘要上方，默认折叠。 -->
      <Collapsible v-model:open="userPromptExpanded" class="mb-3 min-w-0">
        <CollapsibleTrigger as-child>
          <Button variant="outline" class="w-full justify-between" :aria-label="`${userPromptExpanded ? '收起' : '展开'}${userPromptLabel}`">
            <span class="flex items-center gap-2">{{ userPromptLabel }}<LoaderCircle v-if="promptLoading" class="size-3.5 animate-spin" /></span>
            <span class="flex items-center gap-2"><span class="text-muted-foreground tabular-nums">{{ userPrompt.length }} 字</span><ChevronUp v-if="userPromptExpanded" /><ChevronDown v-else /></span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent class="pt-3">
          <p v-if="userPrompt.trim()" class="ds-caption mb-2">将拼接到全部 {{ taskCount }} 个任务</p>
          <Textarea v-model="userPrompt" :rows="3" :aria-label="userPromptLabel" :placeholder="userPromptPlaceholder" />
          <div v-if="SHOW_PROMPT_EDITOR_ENTRY" class="mt-3">
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
        </CollapsibleContent>
      </Collapsible>
      <Collapsible v-model:open="summaryExpanded" class="mb-3">
        <CollapsibleTrigger as-child>
          <Button variant="outline" class="w-full justify-between">
            批量摘要
            <ChevronUp v-if="summaryExpanded" /><ChevronDown v-else />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent class="px-3 py-3">
          <dl class="flex flex-col gap-1.5 text-sm">
            <div class="flex items-baseline justify-between gap-3">
              <dt class="text-muted-foreground">任务数</dt>
              <dd class="tabular-nums">{{ taskCount }}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <dt class="text-muted-foreground">单价</dt>
              <dd class="tabular-nums">{{ formatCredits(unitPrice) }} / 张</dd>
            </div>
            <div class="border-border flex items-baseline justify-between gap-3 border-t pt-1.5">
              <dt class="text-muted-foreground">预计消耗</dt>
              <dd class="font-semibold tabular-nums">{{ formatCredits(totalCost) }}</dd>
            </div>
            <div class="text-muted-foreground/80 pt-1 text-sm leading-4">
              任务按每 3 秒 1 个的节奏依次提交，中途可切换页面，已提交任务不受影响。
            </div>
          </dl>
        </CollapsibleContent>
      </Collapsible>

      <DsParameterPanel
        :label="`批量生成 · ${taskCount} 个任务 · ${formatCredits(totalCost)}`"
        :busy="isSubmitting"
        :busy-label="`提交中 ${submitDone} / ${taskCount}`"
        :disabled="!canGenerate"
        :reason="isSubmitting ? '正在提交任务，请稍候' : blockingHint"
        @submit="handleGenerate"
        v-model:model-id="selectedModelId"
        :models="generationModels"
        :models-loading="!modelCatalog.loaded"
        v-model:aspect-ratio="aspectRatio"
        :aspect-ratios="availableAspectRatios"
        :task-count="taskCount"
        v-model:resolution="resolution"
        :resolutions="availableResolutions"
        @model-change="handleModelChange"
        @resolution-change="handleResolutionChange"
      >
        <template #after>
          <div v-if="submitSummary" class="text-muted-foreground flex items-center gap-2 text-sm"><Progress :model-value="submitPercent" class="h-1 w-28" />{{ submitSummary }}</div>
          <span v-else-if="canGenerate" class="text-muted-foreground text-sm">确认前会再提示一次消耗，提交后在任务面板查看进度</span>
        </template>
      </DsParameterPanel>
    </template>
  </PageLayout>
</template>
