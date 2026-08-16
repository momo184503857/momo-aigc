<template>
  <PageLayout title="提示词专家" subtitle="拆图四玩法：原版拆解 / 拆解融合 / 原图保真换脸换装 / 空间叙事衍生">
    <div class="expert-page">
      <el-tabs v-model="activeTab" type="border-card" class="expert-tabs">
        <!-- ══════ Tab1 原版拆解 18 项 ══════ -->
        <el-tab-pane label="📋 原版拆解(18项)" name="decompose">
          <div class="pane-body">
            <div class="left-col">
              <div class="f-label">上传电商主图（自动提取主色/亮度/构图）</div>
              <ImageSlotUpload
                label="电商主图"
                :max-count="1"
                :required="false"
                :model-value="decomposeImage"
                :size="180"
                @update:model-value="onDecomposeImage"
              />
              <DecomposeForm18
                v-model="decomposeForm"
                :field-options="fieldOptions"
                :auto-filled="autoFilled"
                @reason="onReason"
                @feedback="onFeedback"
              />
            </div>
            <div class="right-col">
              <div class="f-label">选择专家组装 <span class="hint">四种策略 · 点击切换</span></div>
              <div class="expert-cards">
                <div
                  v-for="e in experts" :key="e.id"
                  class="expert-card" :class="{ sel: expertSel === e.id }"
                  @click="expertSel = e.id"
                >
                  <div class="ec-head"><span class="ec-icon">{{ e.icon }}</span><b>{{ e.name }}</b></div>
                  <div class="ec-tagline">{{ e.tagline }}</div>
                  <div class="ec-desc">{{ e.desc }}</div>
                </div>
              </div>
              <div class="f-label">生成的完整 Prompt</div>
              <el-input
                v-model="decomposePrompt"
                type="textarea"
                :rows="16"
                placeholder="填写拆解信息后点击「生成 Prompt」，或使用智能推理补全空项"
              />
              <div class="btn-row">
                <el-button type="primary" @click="buildDecomposePrompt">⚡ 生成 Prompt</el-button>
                <el-button @click="copyText(decomposePrompt)">📋 复制</el-button>
                <el-button :disabled="!decomposePrompt" @click="saveDecompose">💾 存入提示词库</el-button>
                <el-button :disabled="!decomposePrompt" @click="applyToGenerator">🎯 应用到生成器</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ══════ Tab2 拆解融合 ══════ -->
        <el-tab-pane label="🧩 拆解融合" name="fusion">
          <div class="pane-body">
            <div class="left-col">
              <ExpertSlotForm ref="fusionFormRef" v-model="fusionSlots" :slots="FUSION_SLOTS" />
              <div class="f-label" style="margin-top: 12px">模特人设（可选，面部 DNA 锚定）</div>
              <PersonaPicker v-model="fusionPersona" />
              <div class="f-label" style="margin-top: 12px">风格/场景基调补充（可选）</div>
              <el-input v-model="fusionExtra" type="textarea" :rows="3" placeholder="留空则自动以主图为基准" />
            </div>
            <div class="right-col">
              <GenPanel
                title="融合输出（1 张）"
                :prompt="fusionPrompt"
                :generating="generating.fusion"
                :task-id="lastTaskId.fusion"
                @generate="() => generateSingle('fusion')"
                @copy="() => copyText(fusionPrompt)"
              />
            </div>
          </div>
        </el-tab-pane>

        <!-- ══════ Tab3 原图保真换脸换装 ══════ -->
        <el-tab-pane label="🔁 原图保真换脸换装" name="swap">
          <div class="pane-body">
            <div class="left-col">
              <ExpertSlotForm ref="swapFormRef" v-model="swapSlots" :slots="SWAP_SLOTS" />
              <el-alert
                type="info" :closable="false" show-icon style="margin-top: 12px"
                title="基底主图为绝对基准：场景/光影/姿态/构图/色调 100% 保留，仅替换脸型/发型/服装（重拍而非换图）。"
              />
              <div class="f-label" style="margin-top: 12px">服装细节补充（可选）</div>
              <el-input v-model="swapExtra" type="textarea" :rows="3" placeholder="如：领口盘扣保留、下摆开叉位置以参考图为准" />
            </div>
            <div class="right-col">
              <GenPanel
                title="保真换装输出"
                :prompt="swapPrompt"
                :generating="generating.swap"
                :task-id="lastTaskId.swap"
                @generate="() => generateSingle('swap')"
                @copy="() => copyText(swapPrompt)"
              />
            </div>
          </div>
        </el-tab-pane>

        <!-- ══════ Tab4 空间叙事衍生 ══════ -->
        <el-tab-pane label="🎞️ 空间叙事衍生" name="derive">
          <div class="pane-body">
            <div class="left-col">
              <div class="f-label">上传优质电商主图（衍生基底）</div>
              <ImageSlotUpload
                label="优质主图"
                :max-count="1"
                :required="true"
                :model-value="deriveImage"
                :size="180"
                @update:model-value="deriveImage = $event"
              />
              <div class="f-label" style="margin-top: 12px">衍生主题名 <span class="req">*</span></div>
              <el-input v-model="deriveTheme.name" placeholder="如：临湖茶室系列" />
              <div class="f-label" style="margin-top: 12px">空间动线（用 → 分隔 5 个点位）<span class="req">*</span></div>
              <el-input v-model="deriveTheme.path" placeholder="如：湖畔石阶 → 茶室门口 → 落地窗前 → 露台茶席 → 庭院小径" />
              <div class="f-label" style="margin-top: 12px">各点位场景描述（每行一个，可留空自动生成）</div>
              <el-input
                v-model="derivePointsText"
                type="textarea"
                :rows="5"
                placeholder="每行一个点位描述；留空将按动线自动补全「场景元素 + 模特姿态」"
              />
              <div class="btn-row" style="margin-top: 12px">
                <el-button type="primary" @click="saveDerivedTheme">💾 存入我的主题库</el-button>
                <el-button type="primary" plain @click="goSuiteWithDerived">🎬 生成套系</el-button>
              </div>
            </div>
            <div class="right-col">
              <div class="f-label">衍生主题预览</div>
              <ThemeCard
                v-if="derivedPreview"
                :theme="derivedPreview"
                selected
              />
              <div v-else class="hint">填写主题名与动线后自动预览 5 点位</div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import ImageSlotUpload, { type SlotImage } from '@/components/ImageSlotUpload.vue'
import ExpertSlotForm, { type ExpertSlotDef } from '@/components/sg/ExpertSlotForm.vue'
import DecomposeForm18, { type DecomposeFormValue } from '@/components/sg/DecomposeForm18.vue'
import PersonaPicker from '@/components/sg/PersonaPicker.vue'
import ThemeCard from '@/components/sg/ThemeCard.vue'
import { useAssetLibrary } from '@/composables/useAssetLibrary'
import { sgApi, toPromptEntry, type SgKnowledge, type SgPersona } from '@/services/sgApi'
import { uploadImage } from '@/adapter/toapisClient'
import { submitTask } from '@/services/imageGeneration'
import { promptLibraryApi } from '@/services/promptLibraryApi'
import { featurePromptApi } from '@/services/featurePromptApi'
import { assemble, type AssembleContext } from '@/utils/promptEngine'
import { DECOMPOSE_FIELDS } from '@/utils/decomposeSpec'
import {
  DECOMPOSE_EXPERTS, buildFeedbackFixes, findAccurateFeedbackFields, findSimilarHistoryFields,
  type DecomposeExpertId, type DecomposeFeedbackStore, type DecomposeHistoryItem,
} from '@/utils/decomposeExperts'
import { analyzeImage, type ImageAnalysis } from '@/utils/imageAnalysis'
import { DEFAULT_ASPECT_RATIO, DEFAULT_MODEL, DEFAULT_RESOLUTION, type ModelId } from '@/types/adapter'
import { useUiFeedback } from '@/composables/useUiFeedback'

defineOptions({ name: 'ExpertPage' })

const ui = useUiFeedback()
const router = useRouter()

const activeTab = ref('decompose')

// ── 知识库 ──
const knowledgeLib = useAssetLibrary<SgKnowledge>('knowledge')
const locksLib = useAssetLibrary<import('@/services/sgApi').SgLockTemplate>('lock-templates')
const tracksLib = useAssetLibrary<import('@/services/sgApi').SgTrack>('tracks')
onMounted(async () => {
  await Promise.all([knowledgeLib.load(), locksLib.load(), tracksLib.load()])
})

const fieldOptions = computed<Record<string, unknown[]>>(() => {
  const map: Record<string, unknown[]> = {}
  for (const k of knowledgeLib.list.value) {
    if (k.kind === 'field_options' && Array.isArray(k.content)) map[k.field] = k.content
  }
  return map
})

// ══════ Tab1 原版拆解 ══════
const decomposeImage = ref<SlotImage[]>([])
const decomposeForm = ref<DecomposeFormValue>({ theme: '' })
const autoFilled = ref<Record<string, boolean>>({})
const decomposePrompt = ref('')
const expertSel = ref<DecomposeExpertId>('engineer')
const experts = DECOMPOSE_EXPERTS

async function onDecomposeImage(imgs: SlotImage[]) {
  decomposeImage.value = imgs
  const file = imgs[0]?.file
  if (!file) return
  try {
    const a: ImageAnalysis = await analyzeImage(file)
    // 自动填入可推导项
    const brightness = a.brightness > 0.6 ? '明亮通透' : a.brightness > 0.35 ? '中等亮度' : '暗调低光'
    const comp = a.composition.center > 0.4 ? '居中构图' : a.composition.left > a.composition.right ? '偏左三分构图' : '偏右三分构图'
    decomposeForm.value.light = `主色调 ${a.dominantColor}（${a.colorFamily}），整体${brightness}`
    decomposeForm.value.composition = comp
    ui.info(`已自动分析：主色 ${a.dominantColor} · ${brightness} · ${comp}`)
  } catch { /* 分析失败不阻塞 */ }
}

/** 智能推理补全：知识库关键词规则 → 历史拆解兜底 → 同主题「精准」反馈字段优先 */
async function onReason() {
  const theme = (decomposeForm.value.theme || '').trim()
  if (!theme) {
    ui.warning('请先填写「核心主题&风格定位」再推理')
    return
  }
  const lower = theme.toLowerCase()
  const rules = knowledgeLib.list.value.filter((k) => k.kind === 'reason_rule' && k.content && typeof k.content === 'object')
  const hit = (rules.map((k) => k.content as { kw?: string[]; fill?: Record<string, string> })
    .find((r) => (r.kw || []).some((k) => lower.includes(k.toLowerCase()))))
  let fill = hit?.fill || null
  let source = '关键词规则'
  if (!fill) {
    // 规则未命中 → 从提示词库的历史拆解中找相似主题兜底
    const sim = findSimilarHistoryFields(theme, await loadDecomposeHistory())
    if (sim) { fill = sim; source = '历史拆解' }
  }
  if (!fill) {
    ui.warning('未匹配到推理规则或历史拆解，请手动填写或换更明确的关键词（新中式/法式/极简/成熟/甜美/宴会）')
    return
  }
  // 反馈闭环：同主题被标记「精准」的字段优先于规则值（仅补空项）
  const accurate = findAccurateFeedbackFields(theme, loadFeedbackStore())
  const filled: Record<string, boolean> = {}
  for (const f of DECOMPOSE_FIELDS) {
    if ((decomposeForm.value[f.key] || '').trim()) continue
    const val = (accurate?.[f.key] || '').trim() || (fill[f.key] || '').trim()
    if (val) {
      decomposeForm.value[f.key] = val
      filled[f.key] = true
    }
  }
  autoFilled.value = filled
  const n = Object.keys(filled).length
  if (n) ui.success(`已按${source}补全 ${n} 项空项${accurate ? '（同主题「精准」反馈字段优先）' : ''}`)
  else ui.info('推理完成：当前无空项可补全')
}

// ── 反馈闭环（localStorage，键 = 主题名）──
const FEEDBACK_KEY = 'sg_expert_feedback'
function loadFeedbackStore(): DecomposeFeedbackStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}
function onFeedback(ok: boolean) {
  try {
    const store = loadFeedbackStore()
    const theme = decomposeForm.value.theme?.trim()
    if (theme) store[theme] = { ok, fields: { ...decomposeForm.value }, at: Date.now() }
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(store))
    ui.success(ok ? '已记录「精准」反馈，后续同主题推理将优先采用这些字段' : '已记录「需修正」反馈，下次生成 Prompt 时将自动附加修正指令')
  } catch { /* localStorage 异常可忽略 */ }
}

/** 历史拆解（提示词库 sgType=decompose 条目）→ 供推理兜底 */
async function loadDecomposeHistory(): Promise<DecomposeHistoryItem[]> {
  try {
    const res = await promptLibraryApi.list()
    const items = (res.data?.data || []) as Array<{ segments?: Record<string, string> }>
    return items
      .filter((it) => it.segments?.sgType === 'decompose' && (it.segments.theme || '').trim())
      .map((it) => ({ theme: it.segments!.theme, fields: it.segments! }))
  } catch { return [] }
}

/** 按所选专家组装 Prompt，并注入同主题「需修正」反馈的修正指令 */
function buildDecomposePrompt() {
  const hasAny = DECOMPOSE_FIELDS.some((f) => (decomposeForm.value[f.key] || '').trim())
  if (!hasAny) { ui.warning('请先填写拆解信息（至少1项）'); return }
  const expert = DECOMPOSE_EXPERTS.find((e) => e.id === expertSel.value)!
  let prompt = expert.build(decomposeForm.value)
  const fixes = buildFeedbackFixes(decomposeForm.value.theme, loadFeedbackStore())
  if (fixes) prompt += '\n' + fixes
  decomposePrompt.value = prompt
  ui.success(`已按「${expert.name}」组装 Prompt`)
}

async function saveDecompose() {
  try {
    await promptLibraryApi.create({
      name: `拆解 · ${decomposeForm.value.theme || '未命名主题'}`,
      content: decomposePrompt.value,
      segments: { sgType: 'decompose', ...decomposeForm.value },
    })
    ui.success('已存入我的提示词库')
  } catch (err) {
    ui.error(err, '保存失败')
  }
}

/** 应用到生成器：复用跨页任务参数机制，把组装好的 Prompt 注入自由生图表单 */
function applyToGenerator() {
  if (!decomposePrompt.value) { ui.warning('请先生成 Prompt'); return }
  try {
    sessionStorage.setItem('regenerate_task', JSON.stringify({
      modelId: DEFAULT_MODEL,
      prompt: decomposePrompt.value,
      resolution: DEFAULT_RESOLUTION,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      input_image_urls: [],
      feature_id: 'free-gen',
    }))
    router.push('/free-gen')
  } catch {
    ui.error(new Error('写入跳转参数失败'), '应用到生成器失败')
  }
}

// ══════ Tab2/3 融合与保真换装 ══════
const FUSION_SLOTS: ExpertSlotDef[] = [
  { key: 'base', label: '电商主图（场景基准 · 最高权重）', maxCount: 1, required: true },
  { key: 'garment', label: '服装参考图', maxCount: 2, required: true },
]
const SWAP_SLOTS: ExpertSlotDef[] = [
  { key: 'base', label: '优质主图（绝对基底）', maxCount: 1, required: true },
  { key: 'face', label: '模特头像（仅换脸）', maxCount: 1, required: false },
  { key: 'hair', label: '发型参考图', maxCount: 1, required: false },
  { key: 'garment', label: '服装参考图', maxCount: 2, required: false },
]

const fusionFormRef = ref<InstanceType<typeof ExpertSlotForm> | null>(null)
const swapFormRef = ref<InstanceType<typeof ExpertSlotForm> | null>(null)
const fusionSlots = ref<Record<string, SlotImage[]>>({})
const swapSlots = ref<Record<string, SlotImage[]>>({})
const fusionPersona = ref<SgPersona | null>(null)
const fusionExtra = ref('')
const swapExtra = ref('')
const generating = reactive({ fusion: false, swap: false })
const lastTaskId = reactive<{ fusion?: number; swap?: number }>({})

const expertModel = ref<ModelId>('gemini-3.1-flash-image-preview')

/** 系统提示词（feature_prompts，按模型） */
const sysPromptCache = ref<Record<string, string>>({})
async function sysPromptOf(featureId: string): Promise<string> {
  const cacheKey = `${featureId}:${expertModel.value}`
  if (sysPromptCache.value[cacheKey] !== undefined) return sysPromptCache.value[cacheKey]
  try {
    const res = await featurePromptApi.get(featureId)
    const models = res.data.data?.models || []
    const hit = models.find((m: { model_id: string }) => m.model_id === expertModel.value)
    sysPromptCache.value[cacheKey] = hit?.system_prompt || ''
  } catch {
    sysPromptCache.value[cacheKey] = ''
  }
  return sysPromptCache.value[cacheKey]
}

const defaultTrack = computed(() => tracksLib.list.value[0] || {
  key: 'A', name: '默认', mood: '商业女装电商摄影风格', hair: '', light: '', acc: '', hand: '',
})

function expertContext(feature: 'fusion' | 'swap', extra: string): AssembleContext {
  return {
    persona: undefined,
    track: defaultTrack.value as AssembleContext['track'],
    theme: undefined,
    garment: {
      mainUrl: 'ref',
      detail4: { shape: extra, fabric: '', structure: '', element: '' },
    },
    model: expertModel.value,
    feature,
  }
}

const fusionPrompt = computed(() => {
  const r = assemble(locksLib.list.value.map(toPromptEntry), [], expertContext('fusion', fusionExtra.value), 0)
  return r.fullTexts[0] || ''
})

const swapPrompt = computed(() => {
  const r = assemble(locksLib.list.value.map(toPromptEntry), [], expertContext('swap', swapExtra.value), 0)
  return r.fullTexts[0] || ''
})

async function slotToUrls(key: string, slots: Record<string, SlotImage[]>, persona?: SgPersona | null): Promise<string[]> {
  const urls: string[] = []
  for (const img of slots[key] || []) {
    if (img.sourceUrl) urls.push(img.sourceUrl)
    else if (img.file) urls.push(await uploadImage(img.file))
    else {
      const blob = await (await fetch(img.dataUrl)).blob()
      urls.push(await uploadImage(new File([blob], 'ref.png', { type: blob.type || 'image/png' })))
    }
  }
  // 融合模式选了人设且未传头像 → 用人设头像 + 指纹图
  if (key === 'face' && persona && urls.length === 0 && persona.avatar_url) {
    urls.push(persona.avatar_url)
    for (const fp of persona.fingerprint || []) urls.push(fp)
  }
  return urls
}

async function generateSingle(mode: 'fusion' | 'swap') {
  const form = mode === 'fusion' ? fusionFormRef.value : swapFormRef.value
  const err = form?.validate?.()
  if (err) { ui.warning(err); return }
  const slots = mode === 'fusion' ? fusionSlots.value : swapSlots.value
  generating[mode] = true
  try {
    const order = mode === 'fusion' ? ['base', 'garment'] : ['base', 'face', 'hair', 'garment']
    const refUrls: string[] = []
    for (const key of order) {
      refUrls.push(...await slotToUrls(key, slots, mode === 'fusion' ? fusionPersona.value : null))
    }
    if (refUrls.length === 0) { ui.warning('请至少上传一张参考图'); return }
    const sys = await sysPromptOf(mode === 'fusion' ? 'expert-fusion' : 'expert-swap')
    const prompt = [sys, mode === 'fusion' ? fusionPrompt.value : swapPrompt.value].filter(Boolean).join('\n')
    const res = await submitTask({
      model: expertModel.value,
      prompt,
      size: '3:4',
      resolution: '2K',
      refImages: refUrls.map((url) => ({ url })),
      featureId: mode === 'fusion' ? 'expert-fusion' : 'expert-swap',
      n: 1,
      promptSegments: { sgType: mode },
    })
    lastTaskId[mode] = res.dbTaskId
    ui.success('任务已提交，可在「生图结果」页查看进度')
  } catch (e) {
    ui.error(e, '任务提交失败')
  } finally {
    generating[mode] = false
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ui.success('已复制到剪贴板')
  } catch {
    ui.error(new Error('复制失败'), '复制失败，请手动选择复制')
  }
}

// ══════ Tab4 空间叙事衍生 ══════
const deriveImage = ref<SlotImage[]>([])
const deriveTheme = reactive({ name: '', path: '' })
const derivePointsText = ref('')

const derivedPreview = computed(() => {
  if (!deriveTheme.name || !deriveTheme.path) return null
  const pathSegs = deriveTheme.path.split('→').map((s) => s.trim()).filter(Boolean)
  const manual = derivePointsText.value.split('\n').map((s) => s.trim()).filter(Boolean)
  const points = Array.from({ length: Math.max(5, pathSegs.length) }, (_, i) => {
    if (manual[i]) return manual[i]
    const seg = pathSegs[i] || `场景点位${i + 1}`
    const pose = ['自然直立', '缓步行走', '轻靠环境物', '端庄坐姿', '回眸'][i % 5]
    return `${seg}，${pose}，与原图同一空间的连续机位`
  })
  return {
    id: -1, isGlobal: false, status: 'active',
    name: deriveTheme.name, track_key: '', season: [], styles: [], images: [], level: 'M',
    path: pathSegs.join(' → '), points, sort_order: 0,
    use_count: 0,
  }
})

async function saveDerivedTheme() {
  const p = derivedPreview.value
  if (!p) { ui.warning('请先填写主题名与空间动线'); return }
  try {
    await sgApi.createAsset('themes', {
      name: p.name, track_key: '', season: [], level: 'M', path: p.path, points: p.points,
    })
    ui.success('已存入我的主题库')
  } catch (err) {
    ui.error(err, '保存主题失败')
  }
}

async function goSuiteWithDerived() {
  const p = derivedPreview.value
  if (!p) { ui.warning('请先填写主题名与空间动线'); return }
  // 先存主题，再携带主图与主题名跳转成套生图
  await saveDerivedTheme()
  try {
    sessionStorage.setItem('sg_derive_handoff', JSON.stringify({
      themeName: p.name,
      mainDataUrl: deriveImage.value[0]?.dataUrl || '',
    }))
  } catch { /* 超限时仅带主题名 */ }
  router.push('/suite-gen')
}

// ══════ 生成面板（内联小组件） ══════
const GenPanel = defineComponent({
  props: {
    title: { type: String, required: true },
    prompt: { type: String, default: '' },
    generating: { type: Boolean, default: false },
    taskId: { type: Number, default: undefined },
  },
  emits: ['generate', 'copy'],
  setup(props, { emit }) {
    return () => h('div', { class: 'gen-panel' }, [
      h('div', { class: 'f-label' }, props.title),
      h('div', { class: 'prompt-box' }, props.prompt || '上传参考图后自动生成 Prompt（含锁定模板）'),
      h('div', { class: 'btn-row' }, [
        h('button', {
          class: 'el-button el-button--primary',
          disabled: props.generating,
          onClick: () => emit('generate'),
        }, props.generating ? '提交中…' : '🎨 直连生成 1 张'),
        h('button', { class: 'el-button', onClick: () => emit('copy') }, '📋 复制 Prompt'),
        props.taskId
          ? h('button', { class: 'el-button el-button--primary is-plain', onClick: () => { window.open(`#/results?taskId=${props.taskId}`, '_blank') } }, '查看任务')
          : null,
      ]),
    ])
  },
})
</script>

<style scoped>
.expert-page { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.pane-body { display: grid; grid-template-columns: 1fr 1fr; gap: var(--momo-space-4); }
.left-col, .right-col { display: flex; flex-direction: column; gap: var(--momo-space-3); min-width: 0; }
.f-label { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); }
.req { color: var(--momo-color-danger); }
.btn-row { display: flex; gap: var(--momo-space-2); flex-wrap: wrap; }
.hint { color: var(--momo-color-text-tertiary); font-size: var(--momo-font-size-xs); font-weight: normal; }
.expert-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--momo-space-2); }
.expert-card {
  border: 1px solid var(--momo-color-border-soft);
  border-radius: var(--momo-radius-md);
  padding: var(--momo-space-2) var(--momo-space-3);
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}
.expert-card:hover { border-color: var(--momo-color-border-strong); }
.expert-card.sel { border-color: var(--momo-color-brand); background: var(--momo-color-brand-subtle); }
.ec-head { display: flex; align-items: center; gap: var(--momo-space-1); font-size: var(--momo-font-size-sm); color: var(--momo-color-text); }
.ec-tagline { font-size: var(--momo-font-size-xs); color: var(--momo-color-brand); margin-top: 2px; }
.ec-desc { font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary); margin-top: var(--momo-space-1); line-height: 1.5; }
:deep(.gen-panel) { display: flex; flex-direction: column; gap: var(--momo-space-3); }
:deep(.prompt-box) {
  background: var(--momo-color-bg-soft); border-radius: var(--momo-radius-md);
  padding: var(--momo-space-3); font-size: var(--momo-font-size-xs); color: var(--momo-color-text-secondary);
  white-space: pre-wrap; max-height: 300px; overflow-y: auto;
}
</style>
