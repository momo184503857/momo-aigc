<template>
  <PageLayout title="成套生图" subtitle="一张服装图 → 智能匹配整套方案 → 同一场景 5 个机位连续模特照">
    <template #extra>
      <el-button @click="loadHistory">刷新历史</el-button>
    </template>

    <div class="sg-page">
      <!-- ══════════ 向导 ══════════ -->
      <el-card shadow="never" class="wizard-card">
        <div class="wizard-layout">
          <!-- 左侧流程目录：随时可点任意步骤切换，不强制按顺序 -->
          <aside class="wizard-nav">
            <el-steps direction="vertical" :active="step">
              <el-step
                v-for="(s, i) in stepDefs"
                :key="s.title"
                :title="s.title"
                :description="s.hint"
                :status="stepStatus(i)"
                @click="goStep(i)"
              />
            </el-steps>
          </aside>

          <!-- 右侧步骤内容 -->
          <div class="wizard-content">
            <!-- ① 上传 -->
            <div v-if="step === 0" class="step-body">
              <GarmentUpload
                v-model:main="mainImages"
                v-model:detail="detailImages"
                :analysis="analysis"
                @analyzed="onAnalyzed"
              />
              <el-divider content-position="left">
                服装特征（上传主图后 AI 自动识别选中，可手动调整）
                <el-button
                  v-if="mainImages.length > 0"
                  link type="primary" size="small" :loading="recognizing"
                  style="margin-left: var(--momo-space-2)"
                  @click="recognizeGarment"
                >🔄 重新识别</el-button>
              </el-divider>
              <StyleSeasonChips v-model="featureSelection" />
              <div class="step-actions">
                <el-button type="primary" :disabled="mainImages.length === 0" @click="runMatch">✨ 智能匹配整套方案</el-button>
              </div>
            </div>

            <!-- ② 智能匹配 -->
            <div v-else-if="step === 1" class="step-body">
              <SmartMatchPanel
                :plans="matchPlans"
                :selected-track="selectedTrackKey"
                :selected-theme="selectedTheme?.name"
                @apply="onApplyPlan"
                @re-match="runMatch"
              />
              <div class="step-actions">
                <el-button @click="step = 0">上一步</el-button>
                <el-button type="primary" @click="step = 2">下一步：方案微调</el-button>
              </div>
            </div>

            <!-- ③ 微调 -->
            <div v-else-if="step === 2" class="step-body">
              <el-row :gutter="16">
                <el-col :span="12">
                  <div class="f-label">模特人设（DNA + 指纹库身份锚定）</div>
                  <PersonaPicker v-model="persona" />
                </el-col>
                <el-col :span="12">
                  <div class="f-label">风格赛道</div>
                  <TrackSelect v-model="selectedTrackKey" />
                  <div class="f-label" style="margin-top: 12px">季节（过滤主题库）</div>
                  <el-radio-group v-model="season">
                    <el-radio-button value="all">全部</el-radio-button>
                    <el-radio-button value="春">春</el-radio-button>
                    <el-radio-button value="夏">夏</el-radio-button>
                    <el-radio-button value="秋">秋</el-radio-button>
                    <el-radio-button value="冬">冬</el-radio-button>
                  </el-radio-group>
                  <div class="f-label" style="margin-top: 12px">空间叙事主题（1 套 = 1 条动线 = 5 个点位）</div>
                  <SgAssetPicker
                    type="themes"
                    :model-value="selectedTheme?.id ?? null"
                    :extra-query="themeQuery"
                    @select="onSelectTheme"
                  >
                    <template #item="{ item }">
                      <ThemeCard :theme="item" :selected="item.id === selectedTheme?.id" />
                    </template>
                  </SgAssetPicker>
                </el-col>
              </el-row>
              <div class="step-actions">
                <el-button @click="step = 1">上一步</el-button>
                <el-button type="primary" @click="step = 3">下一步：服装细节</el-button>
              </div>
            </div>

            <!-- ④ 服装细节 -->
            <div v-else-if="step === 3" class="step-body">
              <GarmentDetailForm v-model="garmentDetail" />
              <div class="step-actions">
                <el-button @click="step = 2">上一步</el-button>
                <el-button type="primary" @click="step = 4">下一步：Prompt 预览</el-button>
              </div>
            </div>

            <!-- ⑤ Prompt 预览 -->
            <div v-else-if="step === 4" class="step-body">
              <PromptPreview :result="assembleResult" :locks="lockSelections" @update:locks="lockSelections = $event" />
              <div class="step-actions">
                <el-button @click="step = 3">上一步</el-button>
                <el-button type="primary" @click="step = 5">下一步：生成</el-button>
              </div>
            </div>

            <!-- ⑥ 生成 -->
            <div v-else-if="step === 5" class="step-body">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="主题">{{ selectedTheme?.name }}</el-descriptions-item>
                <el-descriptions-item label="赛道">{{ selectedTrack?.emoji }} {{ selectedTrack?.name }}</el-descriptions-item>
                <el-descriptions-item label="模特">{{ persona?.name || '默认' }}</el-descriptions-item>
                <el-descriptions-item label="点位数">5</el-descriptions-item>
                <el-descriptions-item label="模型">
                  <el-select v-model="modelId" style="width: 240px">
                    <template v-if="modelCatalog.loaded">
                      <template v-for="group in modelCatalog.imageGroups" :key="group.providerId">
                        <el-option-group :label="group.mine ? `我的渠道 · ${group.providerName}` : group.providerName">
                          <el-option
                            v-for="m in group.models"
                            :key="m.id"
                            :value="m.logicalCode ?? m.modelId"
                            :label="group.mine ? `${m.displayName}（个人）` : m.displayName"
                          />
                        </el-option-group>
                      </template>
                    </template>
                  </el-select>
                </el-descriptions-item>
                <el-descriptions-item label="分辨率">
                  <el-select v-model="resolution" style="width: 240px">
                    <el-option v-for="r in modelInfo?.capabilities?.resolutions || ['2K']" :key="r" :value="r" :label="r" />
                  </el-select>
                </el-descriptions-item>
                <el-descriptions-item label="画幅">3:4 竖版（电商主图）</el-descriptions-item>
                <el-descriptions-item label="积分预估">
                  <span class="price">5 张 × {{ priceOf(modelId, resolution) }} = {{ 5 * priceOf(modelId, resolution) }} 积分</span>
                </el-descriptions-item>
              </el-descriptions>
              <el-alert
                type="warning" :closable="false" show-icon
                title="将并行提交 5 个生图任务，失败点位不影响其他点位，可单独重新生成。"
              />
              <div class="step-actions">
                <el-button @click="step = 4">上一步</el-button>
                <el-button
                  type="primary"
                  :loading="submitting"
                  :disabled="justSubmitted"
                  @click="submitSuite"
                >
                  <span v-if="justSubmitted">✓ 任务已提交</span>
                  <span v-else>⚡ 生成 5 张（{{ submittedCount }}/5）</span>
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <!-- ══════════ 历史套系 ══════════ -->
      <div class="history-head">
        <h3>历史套系</h3>
        <el-button size="small" @click="loadHistory">刷新</el-button>
      </div>
      <div v-if="suites.length === 0" class="history-empty">暂无套系，完成首次生成后在此查看</div>
      <SuiteTaskGroup
        v-for="s in suites"
        :key="s.id"
        :suite="s"
        class="history-item"
        @refresh="loadHistory"
        @rename="onRenameSuite(s)"
        @regenerate-failed="onRegenerateFailed(s)"
        @publish="onPublishSuite(s)"
        @open-task="onOpenTask"
      />
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import type { SlotImage } from '@/components/ImageSlotUpload.vue'
import GarmentUpload from '@/components/sg/GarmentUpload.vue'
import StyleSeasonChips from '@/components/sg/StyleSeasonChips.vue'
import GarmentDetailForm from '@/components/sg/GarmentDetailForm.vue'
import SmartMatchPanel from '@/components/sg/SmartMatchPanel.vue'
import PersonaPicker from '@/components/sg/PersonaPicker.vue'
import TrackSelect from '@/components/sg/TrackSelect.vue'
import ThemeCard from '@/components/sg/ThemeCard.vue'
import SgAssetPicker from '@/components/sg/AssetPicker.vue'
import PromptPreview from '@/components/sg/PromptPreview.vue'
import SuiteTaskGroup from '@/components/sg/SuiteTaskGroup.vue'
import { useAssetLibrary } from '@/composables/useAssetLibrary'
import { sgApi, toPromptEntry, type SgTheme, type SgTrack, type SgPersona, type SgSuite } from '@/services/sgApi'
import { ossApi } from '@/services/ossApi'
import { submitTask } from '@/services/imageGeneration'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { assemble, type AssembleContext, type AssembleResult, type LockSelection, type GarmentInfo } from '@/utils/promptEngine'
import { matchPlan, type MatchPlan } from '@/utils/smartMatch'
import type { ImageAnalysis } from '@/utils/imageAnalysis'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { worksApi } from '@/services/worksApi'

defineOptions({ name: 'SuiteGenPage' })

const ui = useUiFeedback()

// ── 向导状态 ──
const step = ref(0)
// 流程目录（左侧）：随时可点任意步骤切换，不强制按顺序完成
const stepDefs = [
  { title: '上传服装', hint: '主图+细节+特征' },
  { title: '智能匹配', hint: '赛道×主题推荐' },
  { title: '方案微调', hint: '模特/赛道/季节/主题' },
  { title: '服装细节', hint: '四层描述+印花配饰' },
  { title: 'Prompt 预览', hint: '锁定+点位差异' },
  { title: '生成', hint: '模型/分辨率/提交' },
]
const mainImages = ref<SlotImage[]>([])
const detailImages = ref<SlotImage[]>([])
const analysis = ref<ImageAnalysis | null>(null)
/** 第一步特征选择：{ style: 风格[], season: 适合季节[] }，AI 识别后自动写入 */
const featureSelection = ref<Record<string, string[]>>({ style: [], season: [] })
const recognizing = ref(false)
// 识别请求令牌：主图被快速更换时，旧请求的返回不再生效
let recognizeToken = 0

const matchPlans = ref<MatchPlan<SgTheme>[]>([])
const selectedTrackKey = ref<string | null>(null)
const selectedTheme = ref<SgTheme | null>(null)
const persona = ref<SgPersona | null>(null)
const season = ref<'春' | '夏' | '秋' | '冬' | 'all'>('all')
const garmentDetail = ref<GarmentInfo['detail4'] & Pick<GarmentInfo, 'printText' | 'accessories'>>({
  shape: '', fabric: '', structure: '', element: '', printText: '', accessories: '',
})
const lockSelections = ref<LockSelection[]>([])

const modelCatalog = useModelCatalogStore()
const modelId = ref('gemini-3.1-flash-image-preview')
modelCatalog.ensureLoaded().then(() => {
  // 默认模型动态化：目录中无原默认名时退回首项可用模型（§7.5）
  if (!modelCatalog.getModelByName(modelId.value)) {
    const m = modelCatalog.defaultImageModel
    if (m) modelId.value = m.logicalCode ?? m.modelId
  }
})
/** 提交用渠道模型 id：按模型名在目录解析 */
function resolveChannelModelId(modelName?: string): number {
  return modelCatalog.getModelByName(modelName || modelId.value)?.id
    ?? modelCatalog.defaultImageModel?.id ?? 0
}
const resolution = ref('2K')
const submitting = ref(false)
const submittedCount = ref(0)
// 提交成功后的「已提交」冷却态：按钮禁用 3 秒，防止连点导致整套重复提交
const justSubmitted = ref(false)
let cooldownTimer: ReturnType<typeof setTimeout> | null = null

// 步骤完成度：仅用于左侧目录打勾提示，不阻断切换
const stepDone = computed(() => [
  mainImages.value.length > 0,
  matchPlans.value.length > 0,
  Boolean(selectedTheme.value && selectedTrackKey.value),
  Boolean(
    garmentDetail.value.shape || garmentDetail.value.fabric || garmentDetail.value.structure
    || garmentDetail.value.element || garmentDetail.value.printText || garmentDetail.value.accessories,
  ),
  Boolean(selectedTheme.value && selectedTrackKey.value),
  submittedCount.value > 0,
])

function stepStatus(i: number): 'process' | 'success' | 'wait' {
  if (i === step.value) return 'process'
  return stepDone.value[i] ? 'success' : 'wait'
}

function goStep(i: number) {
  step.value = i
}

// ── 资产库 ──
const tracksLib = useAssetLibrary<SgTrack>('tracks')
const themesLib = useAssetLibrary<SgTheme>('themes')
const locksLib = useAssetLibrary<import('@/services/sgApi').SgLockTemplate>('lock-templates')
const knowledgeLib = useAssetLibrary<import('@/services/sgApi').SgKnowledge>('knowledge')
onMounted(async () => {
  await Promise.all([tracksLib.load(), themesLib.load(), locksLib.load(), knowledgeLib.load()])
  // 接收「空间叙事衍生」跳转：预选主题 + 带入主图
  try {
    const raw = sessionStorage.getItem('sg_derive_handoff')
    if (raw) {
      sessionStorage.removeItem('sg_derive_handoff')
      const handoff = JSON.parse(raw) as { themeName: string; mainDataUrl?: string }
      const theme = themesLib.list.value.find((t) => t.name === handoff.themeName)
      if (theme) {
        selectedTheme.value = theme
        selectedTrackKey.value = theme.track_key || tracksLib.list.value[0]?.key || null
        step.value = 2
      }
      if (handoff.mainDataUrl) {
        mainImages.value = [{ id: `handoff-${Date.now()}`, dataUrl: handoff.mainDataUrl }]
      }
      ui.info('已载入衍生主题草稿，请确认方案后继续')
    }
  } catch { /* 忽略非法 handoff */ }
})

const modelInfo = computed(() => modelCatalog.getModelByName(modelId.value))
watch(modelId, () => {
  const rs = modelInfo.value?.capabilities?.resolutions || []
  if (!rs.includes(resolution.value)) resolution.value = rs[0] || '2K'
})

const themeQuery = computed(() => (season.value === 'all' ? {} : { season: season.value }))

const selectedTrack = computed(() => tracksLib.list.value.find((t) => t.key === selectedTrackKey.value))

function priceOf(model: string, res: string): number {
  return modelCatalog.priceFor(modelCatalog.getModelByName(model), res) ?? 0
}

// ── ① 分析 ──
function onAnalyzed(a: ImageAnalysis) {
  analysis.value = a
  ui.info(`主色识别：${a.dominantColor}（${a.colorFamily}）`)
}

/** dataUrl → 识图接口入参（mimeType + base64） */
function dataUrlToPayload(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  return m ? { mimeType: m[1], base64: m[2] } : null
}

/** 调用默认识图模型识别主图风格与适合季节，识别成功后自动选中对应选项 */
async function recognizeGarment() {
  const img = mainImages.value[0]
  if (!img) return
  const payload = dataUrlToPayload(img.dataUrl)
  if (!payload) {
    ui.warning('主图格式不支持 AI 识别，请重新上传图片文件')
    return
  }
  const token = ++recognizeToken
  recognizing.value = true
  try {
    const res = await sgApi.analyzeGarment(payload)
    if (token !== recognizeToken) return
    const { styles, seasons } = res.data.data
    featureSelection.value = { style: styles, season: seasons }
    ui.success(`AI 识别完成：风格「${styles.join('、') || '未识别'}」· 适合季节「${seasons.join('、') || '未识别'}」`)
  } catch (err) {
    if (token !== recognizeToken) return
    ui.error(err, 'AI 识别失败，可手动勾选特征或点击「重新识别」')
  } finally {
    if (token === recognizeToken) recognizing.value = false
  }
}

// 主图更换（上传/替换/衍生带入）→ 自动 AI 识别并选中
watch(() => mainImages.value[0]?.id, (id) => {
  if (id) recognizeGarment()
})

// ── ② 智能匹配 ──
function matchRules() {
  const tagAff: Record<string, Record<string, number>> = {}
  const colorAff: Record<string, Record<string, number>> = {}
  for (const k of knowledgeLib.list.value) {
    if (k.kind !== 'match_rule' || typeof k.content !== 'object' || !k.content) continue
    const c = k.content as Record<string, Record<string, number>>
    if (k.field === 'tag_affinity') Object.assign(tagAff, c)
    if (k.field === 'color_affinity') Object.assign(colorAff, c)
  }
  return { tag_affinity: tagAff, color_affinity: colorAff }
}

function runMatch() {
  matchPlans.value = matchPlan<SgTheme>(
    tracksLib.list.value,
    themesLib.list.value,
    featureSelection.value.style || [],
    analysis.value?.colorFamily || '',
    matchRules(),
    featureSelection.value.season || [],
  )
  step.value = 1
  if (matchPlans.value.length > 0 && !matchPlans.value.some((p) => p.track.key === selectedTrackKey.value)) {
    onApplyPlan({ trackKey: matchPlans.value[0].track.key, themeName: matchPlans.value[0].themes[0]?.name || '' })
  }
}

function onApplyPlan({ trackKey, themeName }: { trackKey: string; themeName: string }) {
  selectedTrackKey.value = trackKey
  const theme = themesLib.list.value.find((t) => t.name === themeName)
  if (theme) selectedTheme.value = theme
}

function onSelectTheme(t: SgTheme) {
  selectedTheme.value = t
  if (t.track_key) selectedTrackKey.value = t.track_key
}

// ── ⑤ 组装 ──
const assembleResult = computed<AssembleResult>(() => {
  const track = selectedTrack.value || {
    key: 'A', name: '默认', mood: '', hair: '', light: '', acc: '', hand: '',
  }
  const ctx: AssembleContext = {
    persona: persona.value
      ? {
          name: persona.value.name,
          dna: persona.value.dna,
          hair_default: persona.value.hair_default,
          fingerprint: persona.value.fingerprint,
        }
      : undefined,
    track,
    theme: selectedTheme.value
      ? {
          name: selectedTheme.value.name,
          track_key: selectedTheme.value.track_key,
          season: selectedTheme.value.season,
          path: selectedTheme.value.path,
          points: selectedTheme.value.points,
        }
      : undefined,
    garment: {
      mainUrl: '',
      detailUrls: [],
      features: featureSelection.value,
      detail4: {
        shape: garmentDetail.value.shape,
        fabric: garmentDetail.value.fabric,
        structure: garmentDetail.value.structure,
        element: garmentDetail.value.element,
      },
      printText: garmentDetail.value.printText,
      accessories: garmentDetail.value.accessories,
    },
    model: modelId.value,
    feature: 'suite',
    season: season.value === 'all' ? undefined : season.value,
  }
  return assemble(
    locksLib.list.value.map(toPromptEntry),
    lockSelections.value,
    ctx,
    selectedTheme.value?.points.length || 5,
  )
})

// ── ⑥ 提交 ──
async function toUrl(img: SlotImage): Promise<string> {
  if (img.sourceUrl) return img.sourceUrl
  if (img.file) return ossApi.upload(img.file, 'inputs').then((r) => r.publicUrl)
  const blob = await (await fetch(img.dataUrl)).blob()
  const file = new File([blob], 'ref.png', { type: blob.type || 'image/png' })
  return ossApi.upload(file, 'inputs').then((r) => r.publicUrl)
}

async function submitSuite() {
  if (!selectedTheme.value || !selectedTrack.value) {
    ui.warning('请先完成主题与赛道选择')
    return
  }
  submitting.value = true
  submittedCount.value = 0
  try {
    // 参考图统一上传一次（顺序：主图 → 细节图 → 人设头像 → 指纹图）
    const refUrls: string[] = []
    if (mainImages.value[0]) refUrls.push(await toUrl(mainImages.value[0]))
    for (const d of detailImages.value) refUrls.push(await toUrl(d))
    if (persona.value?.avatar_url) refUrls.push(persona.value.avatar_url)
    for (const fp of persona.value?.fingerprint || []) refUrls.push(fp)

    // 保存套系（快照）
    const draft = {
      name: `${selectedTheme.value.name} · ${garmentDetail.value.shape || '成套'} `.slice(0, 100),
      feature_source: 'suite',
      track_snapshot: selectedTrack.value,
      theme_snapshot: {
        name: selectedTheme.value.name,
        track_key: selectedTheme.value.track_key,
        season: selectedTheme.value.season,
        path: selectedTheme.value.path,
        points: selectedTheme.value.points,
      },
      persona_snapshot: persona.value
        ? { name: persona.value.name, dna: persona.value.dna, hair_default: persona.value.hair_default, fingerprint: persona.value.fingerprint }
        : {},
      garment: { features: featureSelection.value, detail: garmentDetail.value, refUrls },
      prompt_common: assembleResult.value.commonText,
      prompt_points: assembleResult.value.pointTexts,
      enabled_locks: lockSelections.value,
      model: modelId.value,
      resolution: resolution.value,
      aspect_ratio: '3:4',
      n_total: selectedTheme.value.points.length || 5,
    }
    const saved = await sgApi.saveSuite(draft)
    const suiteId = saved.data.data.id

    // 热度上报
    themesLib.reportUse(selectedTheme.value.id)
    if (selectedTrack.value) tracksLib.reportUse(selectedTrack.value.id)
    if (persona.value) {
      // persona 库单独上报（懒加载一次即可）
      sgApi.reportAssetUse('personas', persona.value.id).catch(() => {})
    }

    // 并行提交所有点位任务
    const themeName = selectedTheme.value.name
    const trackKey = selectedTrack.value.key
    const total = assembleResult.value.fullTexts.length
    const results = await Promise.all(
      assembleResult.value.fullTexts.map((prompt, i) =>
        submitTask({
          channelModelId: resolveChannelModelId(),
          prompt,
          size: '3:4',
          resolution: resolution.value,
          refImages: refUrls.map((url) => ({ url })),
          featureId: 'suite-gen',
          n: 1,
          suiteId,
          pointIndex: i,
          promptSegments: {
            sgType: 'suite',
            theme: themeName,
            track: trackKey,
            point: String(i + 1),
          },
        })
          .then(() => true)
          .catch((err) => {
            ui.error(err, `点位 ${i + 1} 提交失败，已跳过（可稍后重新生成）`)
            return false
          })
          .finally(() => {
            submittedCount.value += 1
          }),
      ),
    )
    const ok = results.filter(Boolean).length
    if (ok === total) {
      ui.success(`已提交 ${ok}/${total} 个任务，请在下方查看进度`)
    } else if (ok > 0) {
      ui.warning(`提交成功 ${ok}/${total}，失败 ${total - ok} 个点位；请在下方历史套系中对失败点位重提，不要重复点击生成`)
    } else {
      ui.warning('全部点位提交失败：上游可能已创建任务（响应超时），请先到 API 服务商后台确认，避免重复提交产生重复扣费')
    }
    await loadHistory()
    if (ok > 0) {
      // 停留在本步展示「任务已提交」，3 秒冷却后再回到第 1 步
      justSubmitted.value = true
      if (cooldownTimer) clearTimeout(cooldownTimer)
      cooldownTimer = setTimeout(() => {
        justSubmitted.value = false
        submittedCount.value = 0
        if (step.value === 5) step.value = 0
      }, 3000)
    } else {
      step.value = 0
    }
  } catch (err) {
    ui.error(err, '套系提交失败')
  } finally {
    submitting.value = false
  }
}

// ── 历史套系 ──
const suites = ref<SgSuite[]>([])

async function loadHistory() {
  const res = await sgApi.listSuites({ pageSize: 10 })
  suites.value = res.data.data.records
}

async function onRenameSuite(s: SgSuite) {
  const { ElMessageBox } = await import('element-plus')
  try {
    const { value } = await ElMessageBox.prompt('套系名称', '重命名', { inputValue: s.name })
    await sgApi.renameSuite(s.id, value)
    await loadHistory()
  } catch { /* 取消 */ }
}

async function onRegenerateFailed(s: SgSuite) {
  const failed = s.points.filter((p) => p.status === 'failed' || p.status === 'pending')
  if (failed.length === 0) return
  const garment = s.garment as { refUrls?: string[] }
  const refUrls = garment.refUrls || s.tasks[0]?.input_image_urls || []
  const results = await Promise.all(
    failed.map(async (p) => {
      const prompt = s.prompt_points[p.pointIndex]
        ? `${s.prompt_common}\n${s.prompt_points[p.pointIndex]}`
        : s.prompt_common
      try {
        await submitTask({
          channelModelId: resolveChannelModelId(s.model || modelId.value),
          prompt,
          size: s.aspect_ratio || '3:4',
          resolution: s.resolution,
          refImages: refUrls.map((url) => ({ url })),
          featureId: 'suite-gen',
          n: 1,
          suiteId: s.id,
          pointIndex: p.pointIndex,
          promptSegments: { sgType: 'suite', theme: s.theme_snapshot?.name || '', point: String(p.pointIndex + 1) },
        })
        return true
      } catch (err) {
        ui.error(err, `点位 ${p.pointIndex + 1} 重新提交失败`)
        return false
      }
    }),
  )
  const ok = results.filter(Boolean).length
  ui.success(`已重新提交 ${ok}/${failed.length} 个点位`)
  await loadHistory()
}

async function onPublishSuite(s: SgSuite) {
  const done = s.tasks.filter((t) => t.status === 'completed' && t.result_image_urls.length > 0)
  if (done.length === 0) {
    ui.warning('该套系暂无已完成且有结果图的任务')
    return
  }
  try {
    for (const t of done) {
      await worksApi.publish({ source_task_id: t.id, remark: `成套生图 · ${s.theme_snapshot?.name || ''} P${(t.point_index ?? 0) + 1}` })
    }
    ui.success(`已发布 ${done.length} 张作品到作品库`)
  } catch (err) {
    ui.error(err, '发布作品失败')
  }
}

function onOpenTask(taskId: number | null) {
  if (taskId) window.open(`#/results?taskId=${taskId}`, '_blank')
}

onMounted(loadHistory)
onUnmounted(() => {
  if (cooldownTimer) clearTimeout(cooldownTimer)
})
</script>

<style scoped>
.sg-page { display: flex; flex-direction: column; gap: var(--momo-space-4); }
.wizard-card :deep(.el-card__body) { display: flex; flex-direction: column; gap: var(--momo-space-4); }
.wizard-layout { display: flex; align-items: stretch; gap: var(--momo-space-6); }
.wizard-nav { flex: 0 0 176px; padding-right: var(--momo-space-2); border-right: 1px solid var(--momo-color-border-soft); }
.wizard-nav :deep(.el-steps) { height: auto; }
.wizard-nav :deep(.el-step) { cursor: pointer; padding: var(--momo-space-2) 0; }
.wizard-nav :deep(.el-step:hover .el-step__title) { color: var(--momo-color-brand); }
.wizard-content { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: var(--momo-space-4); }
.step-body { display: flex; flex-direction: column; gap: var(--momo-space-4); }
.step-actions { display: flex; justify-content: flex-end; gap: var(--momo-space-2); }
.f-label { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); margin-bottom: var(--momo-space-2); }
.price { color: var(--momo-color-price); font-weight: var(--momo-font-weight-semibold); }
.history-head { display: flex; align-items: center; justify-content: space-between; }
.history-head h3 { margin: 0; font-size: var(--momo-font-size-lg); }
.history-empty { color: var(--momo-color-text-tertiary); text-align: center; padding: var(--momo-space-6); }
.history-item { margin-bottom: var(--momo-space-3); }
</style>
