<script setup lang="ts">
/**
 * 批量换脸（衣服图 × N  +  模特脸图 × 1）
 *
 * 结构：主列 = 批量素材与提示词，右栏 = 共用素材与输出参数，吸底栏 = 提交与进度。
 * 提交循环本身未改动，只额外镜像了 4 个纯视图进度状态（isSubmitting / submitCursor /
 * submitDone / submitFailedAt），用于逐张进度反馈。
 */
import { ref, computed, watch, onMounted } from 'vue'
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight, CircleCheck, CircleX, LoaderCircle, Minus, TriangleAlert } from '@lucide/vue'
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
import PageLayout from '@/components/PageLayout.vue'
import PromptEditorPanel from '@/components/PromptEditorPanel.vue'
import ImageSlotUpload from '@/components/ImageSlotUpload.vue'
import type { SlotImage } from '@/components/ImageSlotUpload.vue'
import ModelChannelSelect from '@/components/ModelChannelSelect.vue'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const router = useRouter()
const { success, warning, error } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Images ───

const clothImages = ref<SlotImage[]>([])
const faceImages = ref<SlotImage[]>([])

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
  if (clothImages.value.length === 0) return false
  if (faceImages.value.length === 0) return false
  return true
})

const taskCount = computed(() => clothImages.value.length)
const totalCost = computed(() => Math.round(unitPrice.value * taskCount.value * 1000) / 1000)

// ─── 提交进度（纯视图状态，不参与任何业务判定） ───

const isSubmitting = ref(false)
const submitCursor = ref(-1)
const submitDone = ref(0)
const submitFailedAt = ref(-1)

/** 素材变化即视为新的一批，清空上一轮的进度显示 */
watch([clothImages, faceImages], () => {
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
  if (clothImages.value.length === 0) return '请上传至少 1 张衣服图'
  if (faceImages.value.length === 0) return '请上传 1 张模特脸图'
  return ''
})

/** 仅 UI：页头步骤指示，与 blockingHint 同源 */
const steps = computed(() => [
  { label: '衣服图', done: clothImages.value.length > 0 },
  { label: '脸图', done: faceImages.value.length > 0 },
  { label: '提交', done: submitDone.value > 0 },
])

// ─── Fetch prompts ───

async function fetchPrompts() {
  promptLoading.value = true
  try {
    const res = await featurePromptApi.get('change-face')
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
      `衣服图：${count} 张\n模特脸图：1 张\n任务数量：${count} 个\n预计消耗：${formatCredits(total)}`,
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
    // 模特脸图（所有任务共用）：循环外解析为 OSS URL 一次，避免重复上传
    const faceUrl = await resolveSlotUrl(faceImages.value[0])

    let submitted = 0
    let failed = false

    for (let i = 0; i < clothImages.value.length; i++) {
      const clothImg = clothImages.value[i]
      submitCursor.value = i
      try {
        const clothRef = await resolveSlotUrl(clothImg)

        // 调用统一入口 submitTask
        // change-face 的参考图顺序：目标图（衣服图）在前，源脸图在后
        await submitTask({
          logicalModelId: selectedModelId.value,
          prompt,
          size: aspectRatio.value,
          resolution: resolution.value,
          refImages: [{ url: clothRef }, { url: faceUrl }],
          featureId: 'change-face',
          userPrompt: userPrompt.value.trim(),
        })

        submitted++
        submitDone.value = submitted
        // Trigger global task list refresh
        window.dispatchEvent(new CustomEvent('canvas:task-created'))

        // Delay between tasks
        if (i < clothImages.value.length - 1) {
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
  <PageLayout>
    <template #header>
      <div class="flex min-w-0 items-center gap-2.5">
        <Button variant="ghost" size="icon-sm" aria-label="返回工具箱" @click="router.push('/toolbox')">
          <ArrowLeft class="size-4" />
        </Button>
        <div class="min-w-0">
          <h2 class="truncate">批量换脸</h2>
          <p class="text-muted-foreground truncate text-[12.5px]">
            {{ taskCount }} 张衣服图 × 1 张共用脸图 → {{ taskCount }} 个任务
          </p>
        </div>
      </div>
    </template>

    <template #extra>
      <ol class="border-border mr-1 hidden items-center gap-1.5 border-r pr-4 md:flex">
        <li
          v-for="(s, i) in steps"
          :key="s.label"
          class="flex items-center gap-1.5 text-[12px]"
        >
          <span
            class="flex size-4 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums"
            :class="s.done
              ? 'border-success bg-success text-white'
              : 'border-border text-muted-foreground'"
          >
            <CircleCheck v-if="s.done" class="size-2.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span :class="s.done ? 'text-foreground' : 'text-muted-foreground'">{{ s.label }}</span>
          <ChevronRight v-if="i < steps.length - 1" class="text-muted-foreground/40 size-3" />
        </li>
      </ol>
      <Badge variant="secondary" class="tabular-nums">{{ taskCount }} 个任务</Badge>
      <Badge variant="outline" class="tabular-nums">{{ formatCredits(totalCost) }} 积分</Badge>
    </template>

    <!-- API Key warning -->
    <Alert v-if="serverStatus.loaded && !serverStatus.canGenerate" variant="warning" class="content-max mb-4">
      <TriangleAlert />
      <AlertTitle>暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型</AlertTitle>
    </Alert>

    <div class="content-max grid min-w-0 items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <!-- 主列：批量素材 + 提示词 -->
      <div class="min-w-0">
        <!-- ① 衣服图（批量源） -->
        <section class="border-border pb-6">
          <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-[13px] font-semibold">
              衣服图
              <span class="text-muted-foreground ml-1.5 font-normal">
                必填 · 每张生成 1 个任务，最多 20 张，可直接拖图
              </span>
            </h3>
            <Badge variant="outline" class="h-4 shrink-0 px-1.5 text-[10px] tabular-nums">
              {{ clothImages.length }} / 20
            </Badge>
          </div>
          <ImageSlotUpload
            label=""
            :max-count="20"
            :required="true"
            :model-value="clothImages"
            :size="120"
            align-left
            @update:model-value="clothImages = $event"
          />
        </section>

        <!-- ② 提交明细（仅提交过程中/提交后出现） -->
        <section v-if="hasSubmitRun" class="border-border border-t pt-4">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-[13px] font-semibold">
              提交明细
              <span class="text-muted-foreground ml-1.5 font-normal">任务已进入全局任务面板</span>
            </h3>
            <span class="text-muted-foreground text-[11px] tabular-nums">
              {{ submitDone }} / {{ taskCount }}
            </span>
          </div>
          <ul class="divide-border max-h-72 divide-y overflow-y-auto rounded-md border">
            <li
              v-for="(img, i) in clothImages"
              :key="img.id"
              class="flex items-center gap-2.5 px-2 py-1.5"
            >
              <span class="text-muted-foreground w-5 shrink-0 text-right text-[11px] tabular-nums">
                {{ i + 1 }}
              </span>
              <img :src="img.dataUrl" class="media-tile size-8 shrink-0" :alt="imageName(img, i)" />
              <span class="text-foreground/90 min-w-0 flex-1 truncate text-[12.5px]">
                {{ imageName(img, i) }}
              </span>
              <span
                class="flex shrink-0 items-center gap-1 text-[11.5px]"
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

        <!-- ③ 提示词 -->
        <section class="border-border pt-6">
          <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-[13px] font-semibold">
              {{ userPromptLabel }}
              <LoaderCircle v-if="promptLoading" class="text-muted-foreground ml-1.5 size-3.5 animate-spin" />
              <span v-if="userPrompt.trim()" class="text-muted-foreground ml-1.5 font-normal">
                将拼接到全部 {{ taskCount }} 个任务
              </span>
            </h3>
            <span class="text-muted-foreground text-[11px] tabular-nums">{{ userPrompt.length }} 字</span>
          </div>
          <Textarea v-model="userPrompt" :rows="3" :placeholder="userPromptPlaceholder" />
          <div class="mt-3">
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
        </section>
      </div>

      <!-- 右栏：共用素材 + 输出参数 -->
      <aside class="flex min-w-0 flex-col gap-6">
        <section>
          <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-[13px] font-semibold">
              模特脸图
              <span class="text-muted-foreground ml-1.5 font-normal">必填 · 所有任务共用</span>
            </h3>
            <Badge variant="outline" class="h-4 shrink-0 px-1.5 text-[10px] tabular-nums">× 1</Badge>
          </div>
          <ImageSlotUpload
            label=""
            :max-count="1"
            :required="true"
            :model-value="faceImages"
            :size="120"
            align-left
            @update:model-value="faceImages = $event"
          />
          <p class="text-muted-foreground mt-1 text-[11.5px] leading-4">
            源图五官将替换到每张衣服图的人脸上。
          </p>
        </section>

        <section class="border-border border-t pt-5">
          <h3 class="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-wider uppercase">
            输出参数
          </h3>
          <div class="flex flex-col gap-3">
            <div>
              <label class="text-muted-foreground mb-1 block text-[11.5px]">模型</label>
              <ModelChannelSelect v-model="selectedModelId" @change="handleModelChange" />
            </div>
            <div>
              <label class="text-muted-foreground mb-1 block text-[11.5px]">分辨率</label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                :model-value="resolution"
                @update:model-value="(v) => { if (v) { resolution = String(v); handleResolutionChange() } }"
              >
                <ToggleGroupItem v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div>
              <label class="text-muted-foreground mb-1 block text-[11.5px]">宽高比</label>
              <Select v-model="aspectRatio">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="选择宽高比" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="ar in availableAspectRatios" :key="ar" :value="ar">{{ ar }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section class="border-border border-t pt-5">
          <h3 class="text-muted-foreground mb-2 text-[11px] font-medium tracking-wider uppercase">
            批量摘要
          </h3>
          <dl class="flex flex-col gap-1.5 text-[12.5px]">
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
              <dd class="font-semibold tabular-nums">{{ formatCredits(totalCost) }} 积分</dd>
            </div>
            <p class="text-muted-foreground/80 pt-1 text-[11.5px] leading-4">
              任务按每 3 秒 1 个的节奏依次提交，中途可切换页面，已提交任务不受影响。
            </p>
          </dl>
        </section>
      </aside>
    </div>

    <!-- 吸底操作栏 -->
    <template #footer>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <Button size="lg" class="min-w-52 gap-2" :disabled="!canGenerate" @click="handleGenerate">
          <LoaderCircle v-if="isSubmitting" class="size-3.5 animate-spin" />
          {{ isSubmitting
            ? `提交中 ${submitDone} / ${taskCount}`
            : `批量生成 · ${taskCount} 个任务 · ${formatCredits(totalCost)}` }}
        </Button>

        <div
          v-if="submitSummary"
          class="text-muted-foreground flex items-center gap-2 text-[12px]"
        >
          <Progress :model-value="submitPercent" class="h-1 w-28" />
          {{ submitSummary }}
        </div>
        <span
          v-else-if="blockingHint"
          class="text-destructive text-[12px]"
        >
          {{ blockingHint }}
        </span>
        <span v-else class="text-muted-foreground text-[12px]">
          确认前会再提示一次消耗，提交后在任务面板查看进度
        </span>
      </div>
    </template>
  </PageLayout>
</template>
