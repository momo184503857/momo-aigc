<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
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

const router = useRouter()
const { success, warning, error } = useUiFeedback()
const serverStatus = useServerStatusStore()

// ─── Images ───

const modelImages = ref<SlotImage[]>([])
const garmentImages = ref<SlotImage[]>([])

// ─── Prompt ───

const promptLoading = ref(false)
const modelPrompts = ref<Record<string, FeaturePromptItem>>({})
const userPrompt = ref('')

const promptKey = computed(() => selectedModel.value?.logicalCode ?? selectedModel.value?.modelId ?? '')
const currentPrompt = computed(() => modelPrompts.value[promptKey.value])

// 当前会话内用户对系统提示词的修改，按 modelId 隔离；不持久化到服务器
const editedSystemPromptsByModel = ref<Record<string, string>>({})

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

// ─── Model / Resolution / Aspect Ratio ───

const modelCatalog = useModelCatalogStore()
const selectedChannelModelId = ref(0)
const resolution = ref('')
const aspectRatio = ref('')

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

const selectedModel = computed<CatalogModel | undefined>(() => modelCatalog.getModel(selectedChannelModelId.value))
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
  if (!selectedChannelModelId.value) return false
  if (modelImages.value.length === 0) return false
  if (garmentImages.value.length === 0) return false
  return true
})

const taskCount = computed(() => modelImages.value.length)
const totalCost = computed(() => Math.round(unitPrice.value * taskCount.value * 1000) / 1000)

// ─── Fetch prompts ───

async function fetchPrompts() {
  promptLoading.value = true
  try {
    const res = await featurePromptApi.get('change-clothes')
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
    modelPrompts.value = {}
  } finally {
    promptLoading.value = false
  }
}

// 切换模型时，若提示词已加载且该模型还没有本地编辑记录，则初始化为后台默认值
watch(promptKey, (key) => {
  if (!key || Object.keys(modelPrompts.value).length === 0) return
  if (editedSystemPromptsByModel.value[key] === undefined) {
    editedSystemPromptsByModel.value[key] = modelPrompts.value[key]?.system_prompt || ''
  }
})

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
      `模特图：${count} 张\n衣服图：1 张\n任务数量：${count} 个\n预计消耗：${formatCredits(total)}`,
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
  // 衣服图（所有任务共用）：循环外解析为 OSS URL 一次，避免重复上传
  const garmentUrl = await resolveSlotUrl(garmentImages.value[0])

  let submitted = 0
  let failed = false

  for (let i = 0; i < modelImages.value.length; i++) {
    const modelImg = modelImages.value[i]
    try {
      const modelRef = await resolveSlotUrl(modelImg)

      // 调用统一入口 submitTask
      await submitTask({
        channelModelId: selectedChannelModelId.value,
        prompt,
        size: aspectRatio.value,
        resolution: resolution.value,
        refImages: [{ url: modelRef }, { url: garmentUrl }],
        featureId: 'change-clothes',
        userPrompt: userPrompt.value.trim(),
      })

      submitted++
      // Trigger global task list refresh
      window.dispatchEvent(new CustomEvent('canvas:task-created'))

      // Delay between tasks
      if (i < modelImages.value.length - 1) {
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
        <h2>批量换姿势</h2>
      </div>
    </template>

    <div class="batch-form" v-loading="promptLoading">
      <div class="form-scroll-area">
        <!-- API Key warning -->
        <el-alert
          v-if="serverStatus.loaded && !serverStatus.canGenerate"
          title="暂无可用模型（渠道未配置或已停用），请联系管理员配置渠道与模型"
          type="warning"
          show-icon
          :closable="false"
          style="margin-bottom: 16px"
        />

        <!-- Model images -->
        <div class="form-row-inline">
          <label class="form-label-left">模特图</label>
          <div class="form-control-right">
            <ImageSlotUpload
              label=""
              :max-count="20"
              :required="true"
              :model-value="modelImages"
              :size="120"
              align-left
              @update:model-value="modelImages = $event"
            />
            <div class="slot-hint">支持上传多张模特图，每张将分别与衣服图组合生成</div>
          </div>
        </div>

        <!-- Garment image -->
        <div class="form-row-inline">
          <label class="form-label-left">衣服图</label>
          <div class="form-control-right">
            <ImageSlotUpload
              label=""
              :max-count="1"
              :required="true"
              :model-value="garmentImages"
              :size="120"
              align-left
              @update:model-value="garmentImages = $event"
            />
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

        <!-- Model -->
        <div class="form-row-inline">
          <label class="form-label-left">模型</label>
          <div class="form-control-right">
            <el-select v-model="selectedChannelModelId" style="width: 100%" @change="handleModelChange">
              <template v-if="modelCatalog.loaded">
                <template v-for="group in modelCatalog.imageGroups" :key="group.providerId">
                  <el-option-group :label="group.providerName">
                    <el-option
                      v-for="m in group.models"
                      :key="m.id"
                      :label="m.displayName"
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
