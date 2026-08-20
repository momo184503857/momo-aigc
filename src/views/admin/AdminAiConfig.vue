<script setup lang="ts">
/**
 * AdminAiConfig - 管理后台「配置」页：AI 服务商 / 模型 / Key 池管理。
 *
 * 关系：服务商 1─N 模型、服务商 1─N Key（Key 池：正整数优先级小者优先，同优先级按录入先后）。
 * Key 状态：active/disabled 管理员启停；exhausted 由服务端欠费切换自动标记（红色「已耗尽」），
 * 充值后管理员「重新启用」恢复参与轮换。
 * 模型能力：识图（图片输入）/ 生图（图片输出，生图模型必定支持识图）。
 * 实际调用由后端 providers/ 适配器层完成，本页仅做配置与调试。
 */
defineOptions({ name: 'AdminAiConfig' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useClipboard } from '@/composables/useClipboard'
import PageLayout from '@/components/PageLayout.vue'
import {
  aiConfigApi,
  type ProviderRow,
  type ModelRow,
  type ProviderKeyRow,
  type AdapterInfo,
  type LogicalModelRow,
} from '@/services/aiConfigApi'
import { Plus, Refresh, Edit, Delete, Key, Connection, UploadFilled, ChatDotRound, CopyDocument } from '@element-plus/icons-vue'

const { success, warning, error, confirmDanger } = useUiFeedback()
const { copy } = useClipboard()

// ── 服务商列表 ──
const providers = ref<ProviderRow[]>([])
const adapters = ref<AdapterInfo[]>([])
const loading = ref(false)
const selectedId = ref<number | null>(null)
const selected = computed(() => providers.value.find((p) => p.id === selectedId.value) ?? null)
/** 顶层页签：providers（服务商与模型）/ logical（逻辑模型） */
const activeTab = ref('providers')
/** 服务商详情内层页签：models / keys / debug */
const detailTab = ref('models')

// 测试连接状态
const testingProvider = ref(false)

async function loadAll() {
  loading.value = true
  try {
    const res = await aiConfigApi.listProviders()
    providers.value = res.data.data || []
    if (providers.value.length && !providers.value.some((p) => p.id === selectedId.value)) {
      selectedId.value = providers.value[0].id
    }
    if (!providers.value.length) selectedId.value = null
  } catch (e) {
    error(e, '加载配置失败')
  } finally {
    loading.value = false
  }
}

async function loadAdapters() {
  try {
    const res = await aiConfigApi.listAdapters()
    adapters.value = res.data.data || []
  } catch { /* 下拉兜底为空，新建时后端仍会校验 */ }
}

// ── 服务商弹窗 ──
const providerDialog = ref(false)
const providerEditing = ref<ProviderRow | null>(null)
const providerForm = ref({ name: '', code: '', base_url: '', adapter: 'openai_compat', remark: '' })
const providerSubmitting = ref(false)

function openProviderCreate() {
  providerEditing.value = null
  providerForm.value = { name: '', code: '', base_url: '', adapter: 'openai_compat', remark: '' }
  providerDialog.value = true
}

function openProviderEdit(row: ProviderRow) {
  providerEditing.value = row
  providerForm.value = { name: row.name, code: row.code, base_url: row.base_url, adapter: row.adapter, remark: row.remark }
  providerDialog.value = true
}

async function submitProvider() {
  const f = providerForm.value
  if (!f.name.trim() || !f.code.trim() || !f.base_url.trim()) {
    warning('名称、标识、Base URL 均不能为空')
    return
  }
  providerSubmitting.value = true
  try {
    if (providerEditing.value) {
      await aiConfigApi.updateProvider(providerEditing.value.id, {
        name: f.name.trim(), base_url: f.base_url.trim(), adapter: f.adapter, remark: f.remark,
      })
      success('服务商已更新')
    } else {
      const res = await aiConfigApi.createProvider({
        name: f.name.trim(), code: f.code.trim(), base_url: f.base_url.trim(), adapter: f.adapter, remark: f.remark,
      })
      selectedId.value = res.data.data.id
      success('服务商已创建，请继续添加 Key 与模型')
    }
    providerDialog.value = false
    await loadAll()
  } catch (e) {
    error(e, '保存失败')
  } finally {
    providerSubmitting.value = false
  }
}

async function deleteProvider(row: ProviderRow) {
  try {
    await confirmDanger({ message: `确定删除服务商「${row.name}」吗？其下 ${row.models.length} 个模型、${row.keys.length} 把 Key 将一并删除。` })
  } catch { return }
  try {
    await aiConfigApi.deleteProvider(row.id)
    success('已删除')
    await loadAll()
  } catch (e) {
    error(e, '删除失败')
  }
}

async function testProvider(row: ProviderRow) {
  testingProvider.value = true
  try {
    const res = await aiConfigApi.testProvider(row.id)
    const d = res.data.data
    if (d.ok) success(`「${row.name}」${d.message}`)
    else error(`「${row.name}」连接失败：${d.message}`)
    await loadAll()
  } catch (e) {
    error(e, '测试失败')
  } finally {
    testingProvider.value = false
  }
}

// ── 逻辑模型清单（模型弹窗下拉用）──
const logicalModels = ref<LogicalModelRow[]>([])
async function loadLogicalModels() {
  try {
    const res = await aiConfigApi.listLogicalModels()
    logicalModels.value = (res.data.data || []).filter((l) => l.kind === 'image' && l.status === 'active')
  } catch { /* ignore */ }
}

/** 模型弹窗中当前选中逻辑模型的参数（供能力覆盖与定价行渲染） */
const modelLogical = computed(() => logicalModels.value.find((l) => l.id === modelForm.value.logical_model_id) ?? null)
/** 生效分辨率（逻辑模型 ∩ 覆盖），定价行按它渲染 */
const modelEffectiveResolutions = computed(() => {
  const base = modelLogical.value?.defaultParams?.resolutions ?? []
  const ovr = modelForm.value.overrideResolutions
  if (!ovr || ovr.length === 0) return base
  return base.filter((r) => ovr.includes(r))
})
/** 逻辑模型全部宽高比（覆盖勾选用） */
const modelLogicalRatios = computed(() => {
  const p = modelLogical.value?.defaultParams
  if (!p) return []
  const set = new Set<string>(p.aspectRatios ?? [])
  for (const list of Object.values(p.aspectRatiosByResolution ?? {})) for (const a of list) set.add(a)
  return [...set]
})

// ── 模型弹窗 ──
const modelDialog = ref(false)
const modelEditing = ref<ModelRow | null>(null)
const modelForm = ref({
  model_id: '',
  display_name: '',
  supports_vision: false,
  supports_image_gen: false,
  supports_chat: false,
  logical_model_id: null as number | null,
  overrideResolutions: [] as string[],
  overrideRatios: [] as string[],
  overrideMaxRef: null as number | null,
  overrideMaxPromptChars: null as number | null,
  pricing: {} as Record<string, number>,
  remark: '',
})
const modelSubmitting = ref(false)

function openModelCreate() {
  if (!selected.value) return
  modelEditing.value = null
  modelForm.value = {
    model_id: '', display_name: '', supports_vision: false, supports_image_gen: false, supports_chat: false,
    logical_model_id: null as number | null,
    overrideResolutions: [], overrideRatios: [],
    overrideMaxRef: null as number | null, overrideMaxPromptChars: null as number | null,
    pricing: {} as Record<string, number>, remark: '',
  }
  modelDialog.value = true
}

function openModelEdit(row: ModelRow) {
  modelEditing.value = row
  const overrides = (row.param_overrides ?? {}) as Record<string, any>
  modelForm.value = {
    model_id: row.model_id,
    display_name: row.display_name,
    supports_vision: row.supports_vision,
    supports_image_gen: row.supports_image_gen,
    supports_chat: !!row.supports_chat,
    logical_model_id: row.logical_model_id ?? null,
    overrideResolutions: overrides.resolutions ?? [],
    overrideRatios: overrides.aspectRatios ?? [],
    overrideMaxRef: overrides.maxReferenceImages ?? null,
    overrideMaxPromptChars: overrides.maxPromptChars ?? null,
    pricing: { ...(row.pricing ?? {}) } as Record<string, number>,
    remark: row.remark,
  }
  modelDialog.value = true
}

/** 勾选「支持生图」时自动勾选并锁定「支持识图」（生图模型必定支持识图） */
function onGenChange(v: any) {
  modelForm.value.supports_image_gen = !!v
  if (v) modelForm.value.supports_vision = true
}

/** 组装能力覆盖与定价（平台生图模型定价必填 S6） */
function buildModelPayloadExtra(): Record<string, unknown> {
  const f = modelForm.value
  const payload: Record<string, unknown> = {
    supports_chat: f.supports_chat,
    logical_model_id: f.supports_image_gen ? f.logical_model_id : null,
  }
  if (f.supports_image_gen && f.logical_model_id) {
    const overrides: Record<string, unknown> = {}
    if (f.overrideResolutions.length > 0) overrides.resolutions = f.overrideResolutions
    if (f.overrideRatios.length > 0) overrides.aspectRatios = f.overrideRatios
    if (f.overrideMaxRef !== null) overrides.maxReferenceImages = f.overrideMaxRef
    if (f.overrideMaxPromptChars !== null) overrides.maxPromptChars = f.overrideMaxPromptChars
    payload.param_overrides = Object.keys(overrides).length > 0 ? overrides : null
    payload.pricing = f.pricing
  } else {
    payload.param_overrides = null
    payload.pricing = null
  }
  return payload
}

async function submitModel() {
  const f = modelForm.value
  if (!f.model_id.trim()) {
    warning('模型 ID 不能为空')
    return
  }
  if (f.supports_image_gen && !f.supports_vision) {
    warning('支持生图的模型必定支持识图，请同时勾选')
    return
  }
  if (f.supports_image_gen && !f.logical_model_id) {
    warning('生图模型必须关联逻辑模型')
    return
  }
  if (f.supports_image_gen) {
    const missing = modelEffectiveResolutions.value.filter((r) => typeof f.pricing[r] !== 'number')
    if (missing.length > 0) {
      warning(`定价未覆盖分辨率：${missing.join(' / ')}（平台生图模型定价必填）`)
      return
    }
  }
  modelSubmitting.value = true
  try {
    const base = {
      model_id: f.model_id.trim(), display_name: f.display_name.trim(),
      supports_vision: f.supports_vision, supports_image_gen: f.supports_image_gen, remark: f.remark,
    }
    const extra = buildModelPayloadExtra()
    if (modelEditing.value) {
      await aiConfigApi.updateModel(modelEditing.value.id, { ...base, ...extra })
      success('模型已更新')
    } else {
      await aiConfigApi.createModel({ ...base, ...extra, provider_id: selected.value!.id } as any)
      success('模型已添加')
    }
    modelDialog.value = false
    await loadAll()
  } catch (e) {
    error(e, '保存失败')
  } finally {
    modelSubmitting.value = false
  }
}

async function toggleModelStatus(row: ModelRow, active: boolean) {
  try {
    await aiConfigApi.updateModel(row.id, { status: active ? 'active' : 'disabled' })
    success(active ? '已启用' : '已停用')
    await loadAll()
  } catch (e) {
    error(e, '状态更新失败')
  }
}

async function deleteModel(row: ModelRow) {
  try {
    await confirmDanger({ message: `确定删除模型「${row.model_id}」吗？` })
  } catch { return }
  try {
    await aiConfigApi.deleteModel(row.id)
    success('已删除')
    await loadAll()
  } catch (e) {
    error(e, '删除失败')
  }
}

// ── Key 弹窗 ──
const keyDialog = ref(false)
const keyEditing = ref<ProviderKeyRow | null>(null)
const keyForm = ref({ name: '', key: '', priority: null as number | null })
const keySubmitting = ref(false)

function openKeyCreate() {
  if (!selected.value) return
  keyEditing.value = null
  // 新 Key 默认优先级 = 当前最大 + 1（首个为 1），默认排到最后；后端缺省同样处理
  const maxPriority = selected.value.keys.reduce((m, k) => Math.max(m, k.priority), 0)
  keyForm.value = { name: '', key: '', priority: maxPriority + 1 }
  keyDialog.value = true
}

function openKeyEdit(row: ProviderKeyRow) {
  keyEditing.value = row
  keyForm.value = { name: row.name, key: '', priority: row.priority }
  keyDialog.value = true
}

async function submitKey() {
  const f = keyForm.value
  if (keyEditing.value) {
    if (!f.name.trim()) { warning('请填写 Key 名称'); return }
    const payload: { name: string; key?: string; priority?: number } = { name: f.name.trim() }
    if (f.key.trim()) payload.key = f.key.trim()
    // 耗尽态 Key 不允许改优先级（S4：仅重新启用或删除）
    if (keyEditing.value.status !== 'exhausted' && f.priority !== null && Number.isInteger(f.priority) && f.priority >= 1) {
      payload.priority = f.priority
    }
    keySubmitting.value = true
    try {
      await aiConfigApi.updateKey(keyEditing.value.id, payload)
      success('Key 已更新')
      keyDialog.value = false
      await loadAll()
    } catch (e) {
      error(e, '保存失败')
    } finally {
      keySubmitting.value = false
    }
    return
  }
  if (!f.key.trim()) { warning('请输入 API Key'); return }
  keySubmitting.value = true
  try {
    await aiConfigApi.createKey({
      provider_id: selected.value!.id,
      name: f.name.trim(),
      key: f.key.trim(),
      priority: f.priority !== null && Number.isInteger(f.priority) && f.priority >= 1 ? f.priority : undefined,
    })
    success('Key 已添加')
    keyDialog.value = false
    await loadAll()
  } catch (e) {
    error(e, '保存失败')
  } finally {
    keySubmitting.value = false
  }
}

async function toggleKeyStatus(row: ProviderKeyRow, active: boolean) {
  try {
    await aiConfigApi.updateKey(row.id, { status: active ? 'active' : 'disabled' })
    success(active ? '已启用' : '已停用')
    await loadAll()
  } catch (e) {
    error(e, '状态更新失败')
  }
}

/** 重新启用已耗尽的 Key（F4：清空耗尽标记，恢复参与轮换） */
async function reactivateKey(row: ProviderKeyRow) {
  try {
    await confirmDanger({
      title: '重新启用 Key',
      message: `确定重新启用「${row.name}」吗？确认上游已充值——启用后该 Key 将立即按优先级重新参与调用轮换。`,
      confirmText: '重新启用',
      cancelText: '取消',
    })
  } catch { return }
  try {
    await aiConfigApi.updateKey(row.id, { status: 'active' })
    success(`「${row.name}」已重新启用，恢复参与轮换`)
    await loadAll()
  } catch (e) {
    error(e, '重新启用失败')
  }
}

async function deleteKey(row: ProviderKeyRow) {
  try {
    await confirmDanger({ message: `确定删除 Key「${row.name}」吗？` })
  } catch { return }
  try {
    await aiConfigApi.deleteKey(row.id)
    success('已删除')
    await loadAll()
  } catch (e) {
    error(e, '删除失败')
  }
}

// ── Key 测试 ──
const testingKeyId = ref<number | null>(null)

async function testKey(row: ProviderKeyRow) {
  testingKeyId.value = row.id
  try {
    const res = await aiConfigApi.testKey(row.id)
    const d = res.data.data
    if (d.ok) success(`「${row.name}」${d.message}`)
    else error(`「${row.name}」测试失败：${d.message}`)
    await loadAll()
  } catch (e) {
    error(e, '测试失败')
  } finally {
    testingKeyId.value = null
  }
}

// ── 调试调用（对话/识图）──
const debugModel = ref('')
const debugPrompt = ref('识别图片内容')
const debugImage = ref<{ name: string; mimeType: string; base64: string; dataUrl: string } | null>(null)
const debugCalling = ref(false)
const debugResult = ref<{ text: string; reasoning: string | null; usage: any; latencyMs: number } | null>(null)
const debugError = ref('')

const activeModels = computed(() => selected.value?.models.filter((m) => m.status === 'active') ?? [])
const debugModelRow = computed(() => activeModels.value.find((m) => m.model_id === debugModel.value) ?? null)

/** 按文件头魔数识别真实图片类型（扩展名可能是假的，严格的服务商会校验 MIME） */
async function sniffImageMime(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png'
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return 'image/gif'
  if (head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp'
  return file.type || 'image/png'
}

async function onDebugImageChange(uploadFile: any) {
  const file: File = uploadFile.raw
  if (!file) return
  const mimeType = await sniffImageMime(file)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  debugImage.value = { name: file.name, mimeType, base64: dataUrl.split(',')[1] ?? '', dataUrl }
}

async function runDebug() {
  if (!selected.value) return
  if (!debugModel.value) { warning('请选择模型'); return }
  if (debugImage.value && !debugModelRow.value?.supports_vision) {
    warning(`模型「${debugModel.value}」不支持识图，请先移除图片`)
    return
  }
  if (!debugPrompt.value.trim() && !debugImage.value) { warning('提示词与图片不能同时为空'); return }
  debugCalling.value = true
  debugResult.value = null
  debugError.value = ''
  try {
    const res = await aiConfigApi.chat({
      provider_id: selected.value.id,
      model: debugModel.value,
      prompt: debugPrompt.value.trim(),
      image: debugImage.value ? { mimeType: debugImage.value.mimeType, base64: debugImage.value.base64 } : undefined,
    })
    debugResult.value = res.data.data
  } catch (e: any) {
    debugError.value = e.response?.data?.error || e.message || '调用失败'
  } finally {
    debugCalling.value = false
  }
}

// ── 默认识图模型（业务侧 AI 识别出口，如成套生图的服装识别） ──
const defaultVisionValue = ref('')
const defaultVisionSaving = ref(false)

const visionModelOptions = computed(() =>
  providers.value
    .filter((p) => p.status === 'active')
    .flatMap((p) =>
      p.models
        .filter((m) => m.status === 'active' && m.supports_vision)
        .map((m) => ({
          value: `${p.id}:${m.model_id}`,
          label: `${p.name} / ${m.display_name || m.model_id}`,
        })),
    ),
)

async function loadDefaultVision() {
  try {
    const res = await aiConfigApi.getDefaultVisionModel()
    const d = res.data.data
    defaultVisionValue.value = d ? `${d.providerId}:${d.modelId}` : ''
  } catch { /* 加载失败时下拉保持空，不阻塞页面 */ }
}

async function saveDefaultVision(value: string) {
  defaultVisionSaving.value = true
  try {
    if (value) {
      const sep = value.indexOf(':')
      await aiConfigApi.setDefaultVisionModel({
        provider_id: Number(value.slice(0, sep)),
        model_id: value.slice(sep + 1),
      })
      const opt = visionModelOptions.value.find((o) => o.value === value)
      success(`默认识图模型已设为「${opt?.label ?? value}」`)
    } else {
      await aiConfigApi.setDefaultVisionModel(null)
      success('已清除默认识图模型')
    }
  } catch (e) {
    error(e, '保存失败')
    await loadDefaultVision()
  } finally {
    defaultVisionSaving.value = false
  }
}

// ── 逻辑模型（代码内置清单 server/src/db/logicalModels.ts；仅显示名可改）──
const allLogicalModels = ref<LogicalModelRow[]>([])
const renamingId = ref<number | null>(null)
const renamingValue = ref('')

async function loadAllLogicalModels() {
  try {
    const res = await aiConfigApi.listLogicalModels()
    allLogicalModels.value = res.data.data || []
    logicalModels.value = allLogicalModels.value.filter((l) => l.kind === 'image' && l.status === 'active')
  } catch { /* ignore */ }
}

function startRename(row: LogicalModelRow) {
  renamingId.value = row.id
  renamingValue.value = row.name
}

async function commitRename(row: LogicalModelRow) {
  if (renamingId.value !== row.id) return
  const name = renamingValue.value.trim()
  renamingId.value = null
  if (!name || name === row.name) return
  try {
    await aiConfigApi.updateLogicalModel(row.id, { name })
    success('显示名已更新')
    await loadAllLogicalModels()
  } catch (e) {
    error(e, '保存失败')
  }
}

function logicalCapabilitySummary(row: LogicalModelRow): string {
  if (row.kind === 'text') return '文字模型'
  const p = row.defaultParams
  const parts: string[] = []
  if (p.resolutions?.length) parts.push(p.resolutions.join('/'))
  const ratioCount = p.aspectRatios?.length ?? Object.values(p.aspectRatiosByResolution ?? {})[0]?.length ?? 0
  if (ratioCount) parts.push(`${ratioCount} 种宽高比`)
  if (p.maxReferenceImages !== undefined) parts.push(`参考图≤${p.maxReferenceImages}`)
  return parts.join(' · ') || '—'
}

onMounted(() => {
  loadAll()
  loadAdapters()
  loadDefaultVision()
  loadAllLogicalModels()
})
</script>

<template>
  <PageLayout>
    <template #header><h2>配置</h2></template>
    <template #extra>
      <div class="default-vision-picker" title="业务侧 AI 识别共用出口，如成套生图第一步的服装风格/季节识别">
        <span class="picker-label">默认识图模型</span>
        <el-select
          v-model="defaultVisionValue"
          :loading="defaultVisionSaving"
          clearable placeholder="未配置" style="width: 280px"
          @change="saveDefaultVision"
        >
          <el-option v-for="opt in visionModelOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
        </el-select>
      </div>
    </template>

    <el-tabs v-model="activeTab" class="config-main-tabs">
      <!-- ═══ Tab 1：服务商与模型（渠道 / 渠道模型 / Key / 调试调用）═══ -->
      <el-tab-pane label="服务商与模型" name="providers">
        <div class="toolbar">
          <div class="hint">管理平台渠道（服务商）、渠道模型与 Key 池。一渠道可配多把 Key，按优先级（小者优先）轮换调用，上游欠费自动切换；生图渠道可选 toapis / openai_image / volcengine_image 协议。</div>
          <div class="toolbar-actions">
            <el-button type="primary" :icon="Plus" @click="openProviderCreate">新增服务商</el-button>
            <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
          </div>
        </div>

        <div v-loading="loading" class="config-layout">
          <!-- 左：服务商列表 -->
          <aside class="provider-list">
            <div
              v-for="p in providers"
              :key="p.id"
              class="provider-card"
              :class="{ active: p.id === selectedId, disabled: p.status !== 'active' }"
              @click="selectedId = p.id"
            >
              <div class="provider-title">
                <span class="status-dot" :class="p.status === 'active' ? 'on' : 'off'" />
                <span class="provider-name">{{ p.name }}</span>
                <el-tag size="small" type="info" effect="plain">{{ p.adapter_label }}</el-tag>
              </div>
              <div class="provider-code">{{ p.code }} · {{ p.base_url }}</div>
              <div class="provider-meta">
                <span>Keys {{ p.keys.length }} · {{ p.models.length }} 模型</span>
                <span v-if="p.has_active_key" class="primary-hint">首Key {{ p.first_key_hint }}</span>
                <span v-else class="primary-hint missing" title="该渠道所有 Key 已停用或耗尽，其下模型实际不可用">
                  无可用 Key
                </span>
              </div>
            </div>
            <div v-if="!providers.length && !loading" class="empty-hint">
              还没有服务商，点击右上角「新增服务商」开始配置。
            </div>
          </aside>

          <!-- 右：所选服务商详情 -->
          <section v-if="selected" class="provider-detail">
            <div class="detail-header">
              <div class="detail-title">
                <h3>{{ selected.name }}</h3>
                <span class="detail-url">{{ selected.base_url }}</span>
              </div>
              <div class="detail-actions">
                <el-button :icon="Connection" :loading="testingProvider" @click="testProvider(selected)">测试连接</el-button>
                <el-button :icon="Edit" @click="openProviderEdit(selected)">编辑</el-button>
                <el-button type="danger" plain :icon="Delete" @click="deleteProvider(selected)">删除</el-button>
              </div>
            </div>
            <p v-if="selected.remark" class="detail-remark">{{ selected.remark }}</p>

            <el-tabs v-model="detailTab">
              <!-- Tab 1：模型管理 -->
              <el-tab-pane label="模型管理" name="models">
                <div class="tab-toolbar">
                  <span class="tab-hint">模型归属于该服务商；支持生图的模型必定支持识图。</span>
                  <el-button type="primary" size="small" :icon="Plus" @click="openModelCreate">新增模型</el-button>
                </div>
                <el-table :data="selected.models" size="default" empty-text="暂无模型">
                  <el-table-column prop="model_id" label="模型 ID" min-width="200" show-overflow-tooltip />
                  <el-table-column prop="display_name" label="显示名" min-width="140" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.display_name || '—' }}</template>
                  </el-table-column>
                  <el-table-column label="识图" width="90" align="center">
                    <template #default="{ row }">
                      <el-tag v-if="row.supports_vision" size="small" type="success" effect="light">识图</el-tag>
                      <span v-else class="cap-no">—</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="生图" width="90" align="center">
                    <template #default="{ row }">
                      <el-tag v-if="row.supports_image_gen" size="small" type="warning" effect="light">生图</el-tag>
                      <span v-else class="cap-no">—</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="文字" width="80" align="center">
                    <template #default="{ row }">
                      <el-tag v-if="row.supports_chat" size="small" type="info" effect="light">文字</el-tag>
                      <span v-else class="cap-no">—</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="逻辑模型" min-width="170" show-overflow-tooltip>
                    <template #default="{ row }">
                      <el-tag v-if="row.logical_code" size="small" effect="plain">{{ row.logical_code }}</el-tag>
                      <span v-else class="cap-no">—</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="定价（积分/张）" min-width="170" show-overflow-tooltip>
                    <template #default="{ row }">
                      <span v-if="row.pricing && Object.keys(row.pricing).length" class="pricing-cell">
                        {{ Object.entries(row.pricing).map(([r, p]) => `${r}:${p}`).join(' · ') }}
                      </span>
                      <span v-else-if="row.supports_image_gen" class="cap-no">未配置</span>
                      <span v-else class="cap-no">—</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="90" align="center">
                    <template #default="{ row }">
                      <el-switch
                        :model-value="row.status === 'active'"
                        @change="(v: any) => toggleModelStatus(row, v)"
                      />
                    </template>
                  </el-table-column>
                  <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.remark || '—' }}</template>
                  </el-table-column>
                  <el-table-column label="操作" width="130" align="center">
                    <template #default="{ row }">
                      <el-button link type="primary" :icon="Edit" @click="openModelEdit(row)">编辑</el-button>
                      <el-button link type="danger" :icon="Delete" @click="deleteModel(row)">删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <!-- Tab 2：Key 池管理 -->
              <el-tab-pane :label="`Key 管理`" name="keys">
                <div class="tab-toolbar">
                  <span class="tab-hint">Key 明文存储、可查看复制；调用按优先级（小者优先）取第一个可用 Key，上游欠费自动切换到下一个。</span>
                  <el-button type="primary" size="small" :icon="Key" @click="openKeyCreate">新增 Key</el-button>
                </div>
                <el-table :data="selected.keys" size="default" empty-text="暂无 Key">
                  <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
                  <el-table-column label="Key" min-width="220">
                    <template #default="{ row }">
                      <div v-if="row.key" class="key-cell">
                        <code class="key-plain" :title="row.key">{{ row.key }}</code>
                        <el-button
                          link type="primary" :icon="CopyDocument"
                          @click="copy(row.key, { successMsg: 'Key 已复制' })"
                        >复制</el-button>
                      </div>
                      <el-tooltip
                        v-else
                        content="历史加密数据无法读取：编辑该 Key 重新保存一次即可查看与复制"
                      >
                        <code class="key-hint">{{ row.key_hint || '—' }}（不可读）</code>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <el-table-column label="优先级" width="90" align="center">
                    <template #default="{ row }">
                      <el-tag size="small" effect="plain">{{ row.priority }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="130" align="center">
                    <template #default="{ row }">
                      <el-switch
                        v-if="row.status !== 'exhausted'"
                        :model-value="row.status === 'active'"
                        @change="(v: any) => toggleKeyStatus(row, v)"
                      />
                      <el-tooltip v-else :content="`耗尽时间：${row.exhausted_at || '—'}（上游判定欠费/额度耗尽，已自动停用轮换）`">
                        <el-tag size="small" type="danger" effect="dark">已耗尽</el-tag>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <el-table-column label="最近检测" min-width="140">
                    <template #default="{ row }">
                      <template v-if="row.last_checked_at">
                        <span :class="['check-result', row.last_check_ok ? 'ok' : 'fail']">
                          {{ row.last_check_ok ? '正常' : '异常' }}
                        </span>
                        <span class="check-time">{{ row.last_checked_at }}</span>
                      </template>
                      <span v-else class="cap-no">未检测</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="220" align="center">
                    <template #default="{ row }">
                      <el-button
                        v-if="row.status === 'exhausted'"
                        link type="success" @click="reactivateKey(row)"
                      >重新启用</el-button>
                      <el-button
                        link type="success" :loading="testingKeyId === row.id" @click="testKey(row)"
                      >测试</el-button>
                      <el-button link type="primary" :icon="Edit" @click="openKeyEdit(row)">编辑</el-button>
                      <el-button link type="danger" :icon="Delete" @click="deleteKey(row)">删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <!-- Tab 3：调试调用 -->
              <el-tab-pane label="调试调用" name="debug">
                <div class="debug-panel">
                  <div class="debug-form">
                    <div class="debug-row">
                      <label>模型</label>
                      <el-select v-model="debugModel" placeholder="选择模型" style="width: 320px">
                        <el-option
                          v-for="m in activeModels"
                          :key="m.id"
                          :value="m.model_id"
                          :label="m.display_name ? `${m.display_name}（${m.model_id}）` : m.model_id"
                        >
                          <span>{{ m.display_name || m.model_id }}</span>
                          <el-tag v-if="m.supports_vision" size="small" type="success" effect="light" style="margin-left:8px">识图</el-tag>
                          <el-tag v-if="m.supports_image_gen" size="small" type="warning" effect="light" style="margin-left:4px">生图</el-tag>
                        </el-option>
                      </el-select>
                    </div>
                    <div class="debug-row">
                      <label>提示词</label>
                      <el-input
                        v-model="debugPrompt" type="textarea" :rows="3"
                        placeholder="输入调试提示词" style="flex:1"
                      />
                    </div>
                    <div class="debug-row">
                      <label>图片</label>
                      <div class="image-control">
                        <el-upload
                          :show-file-list="false" :auto-upload="false" accept="image/*"
                          :on-change="onDebugImageChange" :disabled="!debugModelRow?.supports_vision"
                        >
                          <el-button :icon="UploadFilled" :disabled="!debugModelRow?.supports_vision">
                            {{ debugImage ? '重新选择图片' : '选择图片' }}
                          </el-button>
                        </el-upload>
                        <template v-if="debugImage">
                          <img :src="debugImage.dataUrl" class="debug-thumb" alt="调试图片" />
                          <span class="debug-image-name">{{ debugImage.name }}（{{ debugImage.mimeType }}）</span>
                          <el-button link type="danger" @click="debugImage = null">移除</el-button>
                        </template>
                        <span v-if="debugModelRow && !debugModelRow.supports_vision" class="cap-no">
                          所选模型不支持识图
                        </span>
                        <span v-else class="cap-hint">仅「支持识图」的模型可上传图片</span>
                      </div>
                    </div>
                    <div class="debug-row">
                      <label></label>
                      <div>
                        <el-button
                          type="primary" :icon="ChatDotRound" :loading="debugCalling"
                          :disabled="!debugModel" @click="runDebug"
                        >调用（走第一个可用 Key）</el-button>
                      </div>
                    </div>
                  </div>

                  <div v-if="debugError" class="debug-error">{{ debugError }}</div>
                  <div v-if="debugResult" class="debug-result">
                    <div class="debug-meta">
                      耗时 {{ debugResult.latencyMs }}ms
                      <template v-if="debugResult.usage">
                        · 输入 {{ debugResult.usage.promptTokens ?? '—' }} tok / 输出 {{ debugResult.usage.completionTokens ?? '—' }} tok
                      </template>
                    </div>
                    <pre class="debug-text">{{ debugResult.text }}</pre>
                    <el-collapse v-if="debugResult.reasoning">
                      <el-collapse-item title="思维链（reasoning_content）">
                        <pre class="debug-reasoning">{{ debugResult.reasoning }}</pre>
                      </el-collapse-item>
                    </el-collapse>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </section>

          <section v-else-if="!loading" class="provider-detail empty-detail">
            <el-empty description="选择左侧服务商查看详情，或新增一个服务商" />
          </section>
        </div>
      </el-tab-pane>

      <!-- ═══ Tab 2：逻辑模型（代码内置清单，仅显示名可改）═══ -->
      <el-tab-pane label="逻辑模型" name="logical">
        <section class="logical-section">
          <div class="section-head">
            <h3 class="section-title">逻辑模型</h3>
            <span class="section-hint">标准模型清单由平台代码定义（能力：分辨率/宽高比/上限，一处修改全渠道生效），管理员仅可修改显示名。</span>
          </div>
          <el-table :data="allLogicalModels" size="small" max-height="360">
            <el-table-column prop="code" label="Code" min-width="220" show-overflow-tooltip />
            <el-table-column label="显示名" min-width="200">
              <template #default="{ row }">
                <el-input
                  v-if="renamingId === row.id"
                  v-model="renamingValue" size="small" maxlength="100"
                  @keyup.enter="commitRename(row)"
                  @keyup.esc="renamingId = null"
                  @blur="commitRename(row)"
                />
                <div v-else class="name-cell">
                  <span class="name-text">{{ row.name }}</span>
                  <el-button link type="primary" :icon="Edit" @click="startRename(row)">改名</el-button>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="80" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.kind === 'image' ? 'warning' : 'info'" effect="light">
                  {{ row.kind === 'image' ? '生图' : '文字' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="能力定义" min-width="260" show-overflow-tooltip>
              <template #default="{ row }">{{ logicalCapabilitySummary(row) }}</template>
            </el-table-column>
            <el-table-column prop="modelCount" label="关联渠道模型" width="110" align="center" />
          </el-table>
        </section>
      </el-tab-pane>
    </el-tabs>

    <!-- 服务商弹窗 -->
    <el-dialog
      v-model="providerDialog"
      :title="providerEditing ? '编辑服务商' : '新增服务商'"
      width="560px" destroy-on-close
    >
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="providerForm.name" placeholder="如：火山引擎" maxlength="100" />
        </el-form-item>
        <el-form-item label="标识" required>
          <el-input
            v-model="providerForm.code" placeholder="小写字母/数字/中划线，如 volcengine"
            :disabled="!!providerEditing" maxlength="50"
          />
        </el-form-item>
        <el-form-item label="连接方式" required>
          <el-select v-model="providerForm.adapter" style="width: 100%">
            <el-option v-for="a in adapters" :key="a.code" :value="a.code" :label="a.label">
              <div class="adapter-option">
                <span>{{ a.label }}</span>
                <span class="adapter-desc">{{ a.description }}</span>
              </div>
            </el-option>
          </el-select>
          <div class="form-hint">
            {{ adapters.find((a) => a.code === providerForm.adapter)?.description || '连接方式由后端适配器实现，协议兼容 OpenAI 的服务商直接选「OpenAI 兼容」' }}
          </div>
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="providerForm.base_url" placeholder="https://ark.cn-beijing.volces.com/api/coding/v3" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="providerForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="providerDialog = false">取消</el-button>
        <el-button type="primary" :loading="providerSubmitting" @click="submitProvider">保存</el-button>
      </template>
    </el-dialog>

    <!-- 模型弹窗（渠道模型：关联逻辑模型 + 能力覆盖 + 定价） -->
    <el-dialog
      v-model="modelDialog"
      :title="modelEditing ? '编辑模型' : '新增模型'"
      width="640px" destroy-on-close
    >
      <el-form label-width="110px">
        <el-form-item label="模型 ID" required>
          <el-input v-model="modelForm.model_id" placeholder="调用 API 时使用的模型名（渠道叫法），如 gpt-4o-image" />
          <div class="form-hint">同一逻辑模型在不同渠道可不同名（渠道映射语义）</div>
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="modelForm.display_name" placeholder="选填，默认取逻辑模型名" />
        </el-form-item>
        <el-form-item label="支持识图">
          <el-checkbox
            v-model="modelForm.supports_vision"
            :disabled="modelForm.supports_image_gen"
          >支持上传图片作为输入</el-checkbox>
          <div v-if="modelForm.supports_image_gen" class="form-hint">生图模型必定支持识图，已自动勾选</div>
        </el-form-item>
        <el-form-item label="支持生图">
          <el-checkbox :model-value="modelForm.supports_image_gen" @change="onGenChange">
            支持输出图片（勾选后自动要求支持识图）
          </el-checkbox>
        </el-form-item>
        <el-form-item v-if="modelForm.supports_image_gen" label="逻辑模型" required>
          <el-select v-model="modelForm.logical_model_id" placeholder="选择逻辑模型（继承能力定义）" style="width: 100%">
            <el-option
              v-for="lm in logicalModels" :key="lm.id" :value="lm.id"
              :label="`${lm.name}（${lm.code}）`"
            />
          </el-select>
          <div v-if="modelLogical" class="form-hint">
            模板能力：{{ modelLogical.defaultParams?.resolutions?.join(' / ') || '—' }}；
            宽高比 {{ (modelLogical.defaultParams?.aspectRatios?.length ?? 0) }} 种；
            参考图 ≤ {{ modelLogical.defaultParams?.maxReferenceImages ?? '—' }}
          </div>
        </el-form-item>
        <el-form-item v-if="modelForm.supports_image_gen && modelLogical" label="能力覆盖">
          <div class="override-block">
            <div class="override-row">
              <span class="override-label">分辨率（不勾=全部继承）</span>
              <el-checkbox-group v-model="modelForm.overrideResolutions">
                <el-checkbox v-for="r in (modelLogical.defaultParams?.resolutions || [])" :key="r" :value="r">{{ r }}</el-checkbox>
              </el-checkbox-group>
            </div>
            <div class="override-row">
              <span class="override-label">宽高比（不勾=全部继承）</span>
              <el-select v-model="modelForm.overrideRatios" multiple collapse-tags collapse-tags-tooltip style="width: 100%">
                <el-option v-for="r in modelLogicalRatios" :key="r" :value="r" :label="r" />
              </el-select>
            </div>
            <div class="override-row">
              <span class="override-label">上限收窄（选填）</span>
              <div class="override-inputs">
                参考图 ≤ <el-input-number v-model="modelForm.overrideMaxRef" :min="0" :max="modelLogical.defaultParams?.maxReferenceImages ?? 20" size="small" placeholder="继承" />
                提示词 ≤ <el-input-number v-model="modelForm.overrideMaxPromptChars" :min="100" :max="modelLogical.defaultParams?.maxPromptChars ?? 32000" :step="500" size="small" placeholder="继承" />
              </div>
            </div>
            <div class="form-hint">覆盖只允许收窄（不能超出逻辑模型能力）；生效能力即时反映在定价行</div>
          </div>
        </el-form-item>
        <el-form-item v-if="modelForm.supports_image_gen && modelLogical" label="定价" required>
          <div class="pricing-block">
            <div v-for="r in modelEffectiveResolutions" :key="r" class="pricing-row">
              <span class="pricing-label">{{ r }}</span>
              <el-input-number
                :model-value="modelForm.pricing[r]"
                @update:model-value="(v: any) => modelForm.pricing[r] = v"
                :min="0" :step="0.1" :precision="2" size="small" style="width: 140px"
                placeholder="积分"
              />
              <span class="pricing-unit">积分 / 张</span>
            </div>
            <div v-if="modelEffectiveResolutions.length === 0" class="form-hint">生效能力为空（覆盖过度收窄），请调整</div>
          </div>
        </el-form-item>
        <el-form-item label="支持文字">
          <el-checkbox v-model="modelForm.supports_chat">支持文字调用（画布文字 AI 节点可选；不计积分）</el-checkbox>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="modelForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modelDialog = false">取消</el-button>
        <el-button type="primary" :loading="modelSubmitting" @click="submitModel">保存</el-button>
      </template>
    </el-dialog>

    <!-- Key 弹窗 -->
    <el-dialog
      v-model="keyDialog"
      :title="keyEditing ? '编辑 Key' : '新增 Key'"
      width="520px" destroy-on-close
    >
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="keyForm.name" placeholder="如：生产 Key A / 备用-充值卡B" maxlength="100" />
        </el-form-item>
        <el-form-item :label="keyEditing ? '新 Key' : 'API Key'" :required="!keyEditing">
          <el-input
            v-model="keyForm.key" type="password" show-password
            :placeholder="keyEditing ? '留空表示不修改 Key 内容' : 'ark-... / sk-...'"
          />
        </el-form-item>
        <el-form-item label="优先级" required>
          <el-input-number
            v-model="keyForm.priority" :min="1" :step="1" :precision="0" step-strictly
            :disabled="keyEditing?.status === 'exhausted'"
          />
          <div v-if="keyEditing?.status === 'exhausted'" class="form-hint">已耗尽的 Key 不能修改优先级，请先重新启用或删除</div>
          <div v-else class="form-hint">正整数，数字越小越先用；同优先级按录入先后排序</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="keyDialog = false">取消</el-button>
        <el-button type="primary" :loading="keySubmitting" @click="submitKey">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.logical-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 8px);
  padding: 14px 16px;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.section-title {
  margin: 0;
  font-size: var(--momo-font-size-base, 14px);
  font-weight: 600;
}
.section-hint {
  flex: 1;
  font-size: var(--momo-font-size-xs, 12px);
  color: var(--el-text-color-secondary);
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
}
.name-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.override-block,
.pricing-block {
  width: 100%;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
}
.override-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.override-row:last-child { margin-bottom: 0; }
.override-label {
  width: 150px;
  flex-shrink: 0;
  font-size: var(--momo-font-size-xs, 12px);
  color: var(--el-text-color-secondary);
}
.override-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--momo-font-size-xs, 12px);
  color: var(--el-text-color-secondary);
}
.pricing-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.pricing-row:last-child { margin-bottom: 0; }
.pricing-label {
  width: 60px;
  font-weight: 600;
}
.pricing-unit {
  font-size: var(--momo-font-size-xs, 12px);
  color: var(--el-text-color-secondary);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.toolbar .hint {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.default-vision-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}
.picker-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.config-layout {
  display: flex;
  gap: 16px;
  align-items: stretch;
  min-height: 400px;
}

/* 左：服务商列表 */
.provider-list {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 720px;
  overflow-y: auto;
}

.provider-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color var(--momo-transition-fast), box-shadow var(--momo-transition-fast);
}
.provider-card:hover { border-color: var(--el-color-primary-light-5); }
.provider-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
.provider-card.disabled { opacity: 0.6; }

.provider-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.provider-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.on { background: var(--el-color-success); }
.status-dot.off { background: var(--el-color-danger); }

.provider-code {
  margin-top: 6px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.provider-meta {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}
.primary-hint { font-family: monospace; }
.primary-hint.missing { color: var(--el-color-danger); }

.empty-hint {
  padding: 32px 12px;
  text-align: center;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
}

/* 右：详情 */
.provider-detail {
  flex: 1;
  min-width: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 16px 20px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.detail-title h3 {
  margin: 0;
  font-size: var(--momo-font-size-lg);
  color: var(--el-text-color-primary);
}
.detail-url {
  display: block;
  margin-top: 4px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.detail-actions { display: flex; gap: 8px; flex-shrink: 0; }
.detail-remark {
  margin: 8px 0 0;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}

.empty-detail { display: flex; align-items: center; justify-content: center; }

.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.tab-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}

.pricing-cell {
  font-family: monospace;
  font-size: var(--momo-font-size-xs, 12px);
}
.cap-no { color: var(--el-text-color-placeholder); }
.cap-hint { font-size: var(--momo-font-size-xs); color: var(--el-text-color-secondary); }
.key-hint { font-family: monospace; font-size: var(--momo-font-size-sm); }
.key-cell { display: flex; align-items: center; gap: 4px; min-width: 0; }
.key-plain {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: monospace; font-size: var(--momo-font-size-sm);
}

.check-result.ok { color: var(--el-color-success); }
.check-result.fail { color: var(--el-color-danger); }
.check-time {
  margin-left: 6px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}

.form-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.adapter-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.adapter-desc {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 调试面板 */
.debug-panel { max-width: 760px; }
.debug-form { display: flex; flex-direction: column; gap: 14px; }
.debug-row { display: flex; align-items: flex-start; gap: 12px; }
.debug-row > label {
  width: 56px;
  flex-shrink: 0;
  text-align: right;
  padding-top: 5px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-primary);
}
.image-control {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.debug-thumb {
  width: 56px; height: 56px;
  object-fit: cover;
  border-radius: var(--momo-radius-sm);
  border: 1px solid var(--el-border-color-lighter);
}
.debug-image-name {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debug-error {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--momo-radius-md);
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: var(--momo-font-size-sm);
  white-space: pre-wrap;
}

.debug-result { margin-top: 14px; }
.debug-meta {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.debug-text {
  margin: 0;
  padding: 12px 14px;
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md);
  font-size: var(--momo-font-size-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-primary);
}
.debug-reasoning {
  margin: 0;
  font-size: var(--momo-font-size-xs);
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--el-text-color-secondary);
}
</style>
