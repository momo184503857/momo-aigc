<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useUiFeedback } from '@/composables/useUiFeedback'
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

const router = useRouter()
const { success, warning, error } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Images ───

const modelImages = ref<SlotImage[]>([])
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
    await ElMessageBox.confirm(
      `模特图：1 张\n衣服图：${count} 张\n任务数量：${count} 个\n预计消耗：${formatCredits(total)}`,
      '确认提交',
      {
        confirmButtonText: '确认提交',
        cancelButtonText: '取消',
        type: 'info',
        customStyle: { whiteSpace: 'pre-line' },
      }
    )
  } catch {
    return // cancelled
  }

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
      window.dispatchEvent(new CustomEvent('canvas:task-created'))

      if (i < garmentImages.value.length - 1) {
        await sleep(3000)
      }
    } catch (e: any) {
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
      <div class="page-header-row">
        <el-button :icon="ArrowLeft" text @click="router.push('/toolbox')">返回</el-button>
        <h2>批量换衣服</h2>
      </div>
    </template>

    <div class="batch-form" v-loading="promptLoading">
      <div class="form-scroll-area">
        <el-alert
          v-if="serverStatus.loaded && !serverStatus.canGenerate"
          title="暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型"
          type="warning"
          show-icon
          :closable="false"
          style="margin-bottom: 16px"
        />

        <!-- Model image (single) -->
        <div class="form-row-inline">
          <label class="form-label-left">模特图</label>
          <div class="form-control-right">
            <ImageSlotUpload
              label=""
              :max-count="1"
              :required="true"
              :model-value="modelImages"
              :size="120"
              align-left
              @update:model-value="modelImages = $event"
            />
          </div>
        </div>

        <!-- Garment images (multiple) -->
        <div class="form-row-inline">
          <label class="form-label-left">衣服图</label>
          <div class="form-control-right">
            <ImageSlotUpload
              label=""
              :max-count="20"
              :required="true"
              :model-value="garmentImages"
              :size="120"
              align-left
              @update:model-value="garmentImages = $event"
            />
            <div class="slot-hint">支持上传多张衣服图，每张将分别与模特图组合生成</div>
          </div>
        </div>

        <!-- User Prompt -->
        <div class="form-row-inline form-row-top">
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

        <!-- Model + Channel -->
        <div class="form-row-inline">
          <label class="form-label-left">模型</label>
          <div class="form-control-right">
            <ModelChannelSelect v-model="selectedModelId" @change="handleModelChange" />
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
          批量生成 · {{ taskCount }} 个任务 · {{ formatCredits(totalCost) }}
        </el-button>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.page-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-header-row h2 {
  margin: 0;
}

.batch-form {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.form-scroll-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-bottom: 8px;
}

.form-row-inline {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 14px;
  margin-bottom: 14px;
}

.form-row-top {
  align-items: flex-start;
}

.form-label-left {
  width: 72px;
  flex-shrink: 0;
  text-align: right;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  padding-top: 6px;
}

.form-control-right {
  flex: 1;
  min-width: 0;
}

.slot-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
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
</style>
