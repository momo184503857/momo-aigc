<script setup lang="ts">
import DsThumbnail from '@/components/design-system/composites/DsThumbnail.vue'
import { DsFileInput } from '@/components/design-system'
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
import { DsScrollPage as PageLayout } from '@/components/design-system'
import {
  aiConfigApi,
  type ProviderRow,
  type ModelRow,
  type ProviderKeyRow,
  type AdapterInfo,
  type LogicalModelRow,
  type LogicalModelRouteRow,
} from '@/services/aiConfigApi'
import { Plus, RefreshCw, Pencil, Trash2, Key, Unplug, Upload, MessageCircle, Copy, CircleHelp, ArrowUp, ArrowDown, LoaderCircle, CircleCheck, CircleX, X, GripVertical, ChevronDown, Eye, EyeOff } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/design-system/primitives/alert'
import { Badge } from '@/components/design-system/primitives/badge'
import { Button } from '@/components/design-system/primitives/button'
import { Checkbox } from '@/components/design-system/primitives/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/design-system/primitives/collapsible'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/design-system/primitives/dialog'
import { Input } from '@/components/design-system/primitives/input'
import { Label } from '@/components/design-system/primitives/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/design-system/primitives/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/design-system/primitives/select'
import { Separator } from '@/components/design-system/primitives/separator'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { Switch } from '@/components/design-system/primitives/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/design-system/primitives/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/design-system/primitives/tabs'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/design-system/primitives/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/design-system/primitives/tooltip'
import { UiEmptyState, UiNumberInput } from '@/components/design-system'

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
const providerForm = ref({ name: '', display_name: '', code: '', base_url: '', adapter: 'openai_image', remark: '' })
const providerSubmitting = ref(false)

function openProviderCreate() {
  providerEditing.value = null
  providerForm.value = { name: '', display_name: '', code: '', base_url: '', adapter: 'openai_image', remark: '' }
  providerDialog.value = true
}

function openProviderEdit(row: ProviderRow) {
  providerEditing.value = row
  providerForm.value = { name: row.name, display_name: row.display_name || '', code: row.code, base_url: row.base_url, adapter: row.adapter, remark: row.remark }
  providerDialog.value = true
}

async function submitProvider() {
  const f = providerForm.value
  if (!f.name.trim() || !f.base_url.trim()) {
    warning('名称、Base URL 均不能为空')
    return
  }
  providerSubmitting.value = true
  try {
    if (providerEditing.value) {
      await aiConfigApi.updateProvider(providerEditing.value.id, {
        name: f.name.trim(), display_name: f.display_name.trim(), base_url: f.base_url.trim(), adapter: f.adapter, remark: f.remark,
      })
      success('服务商已更新')
    } else {
      const res = await aiConfigApi.createProvider({
        name: f.name.trim(), display_name: f.display_name.trim(), code: f.code.trim(), base_url: f.base_url.trim(), adapter: f.adapter, remark: f.remark,
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
  costPricing: {} as Record<string, number>,
  remark: '',
})
const modelSubmitting = ref(false)

function openModelCreate() {
  if (!selected.value) return
  modelEditing.value = null
  modelForm.value = {
    model_id: '', display_name: '', supports_vision: false, supports_image_gen: true, supports_chat: false,
    logical_model_id: null as number | null,
    overrideResolutions: [], overrideRatios: [],
    overrideMaxRef: null as number | null, overrideMaxPromptChars: null as number | null,
    costPricing: {} as Record<string, number>, remark: '',
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
    costPricing: { ...(row.cost_pricing ?? {}) } as Record<string, number>,
    remark: row.remark,
  }
  modelDialog.value = true
}

/** 纯 UI：数组型字段（多选/复选组）勾选切换，保持原数组语义 */
function toggleArrayValue(list: string[], option: string, checked: boolean): string[] {
  const next = [...list]
  const idx = next.indexOf(option)
  if (checked && idx < 0) next.push(option)
  if (!checked && idx >= 0) next.splice(idx, 1)
  return next
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
    payload.cost_pricing = f.costPricing
  } else {
    payload.param_overrides = null
    payload.cost_pricing = null
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
    const missing = modelEffectiveResolutions.value.filter((r) => typeof f.costPricing[r] !== 'number')
    if (missing.length > 0) {
      warning(`成本价未覆盖分辨率：${missing.join(' / ')}（生图渠道成本价必填）`)
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
// 纯 UI：密码可见性切换（原 EP 输入框 show-password）
const showKeyInput = ref(false)

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

/** 原生 file input 适配：包装成 onDebugImageChange 期望的 { raw } 结构 */
const debugFileInput = ref<InstanceType<typeof DsFileInput> | null>(null)
function onDebugFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) onDebugImageChange({ raw: file })
  input.value = ''
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
    allLogicalModels.value = (res.data.data || []).map((row) => ({ ...row, salePricing: row.salePricing ?? {} }))
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

/** 纯 UI：售卖价写回（salePricing 类型可空，模板内不做可选链写回；清空 = 删除该分辨率，与 v-model 置 undefined 等价） */
function setSalePrice(row: LogicalModelRow, resolution: string, value: number | undefined) {
  if (!row.salePricing) row.salePricing = {}
  if (value === undefined) delete row.salePricing[resolution]
  else row.salePricing[resolution] = value
}

async function saveSalePricing(row: LogicalModelRow) {
  const resolutions = row.defaultParams.resolutions ?? []
  const pricing = row.salePricing ?? {}
  const missing = resolutions.filter((resolution) => typeof pricing[resolution] !== 'number')
  if (missing.length > 0) {
    warning(`售卖价未覆盖分辨率：${missing.join(' / ')}`)
    return
  }
  try {
    await aiConfigApi.updateLogicalModel(row.id, { sale_pricing: pricing })
    success('统一售卖价已更新')
    await loadAllLogicalModels()
  } catch (e) {
    error(e, '售卖价保存失败')
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

/** 某逻辑模型在某分辨率下的各渠道成本价（复用已加载的 providers 数据，按成本升序） */
function costEntries(logicalId: number, resolution: string) {
  const entries: { channel: string; model: string; price: number; disabled: boolean }[] = []
  for (const p of providers.value) {
    for (const m of p.models) {
      if (m.logical_model_id !== logicalId) continue
      const price = m.cost_pricing?.[resolution]
      if (typeof price !== 'number') continue
      entries.push({
        channel: p.name,
        model: m.display_name || m.model_id,
        price,
        disabled: p.status !== 'active' || m.status !== 'active',
      })
    }
  }
  return entries.sort((a, b) => a.price - b.price)
}

function fmtCost(value: number): string {
  return Number(value.toFixed(4)).toString()
}

// ── 逻辑模型渠道路由顺序 ──
const routeDialog = ref(false)
const routeEditing = ref<LogicalModelRow | null>(null)
const routeDraft = ref<LogicalModelRouteRow[]>([])
const routeSaving = ref(false)
const draggedRouteId = ref<number | null>(null)

function openRouteEditor(row: LogicalModelRow) {
  routeEditing.value = row
  routeDraft.value = (row.routes ?? []).map((route) => ({ ...route, costPricing: route.costPricing ? { ...route.costPricing } : null }))
  draggedRouteId.value = null
  routeDialog.value = true
}

function moveRoute(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= routeDraft.value.length) return
  const next = [...routeDraft.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  routeDraft.value = next
}

function startRouteDrag(event: DragEvent, route: LogicalModelRouteRow) {
  draggedRouteId.value = route.channelModelId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(route.channelModelId))
  }
}

function dropRoute(target: LogicalModelRouteRow) {
  const sourceId = draggedRouteId.value
  draggedRouteId.value = null
  if (!sourceId || sourceId === target.channelModelId) return
  const next = [...routeDraft.value]
  const sourceIndex = next.findIndex((route) => route.channelModelId === sourceId)
  const targetIndex = next.findIndex((route) => route.channelModelId === target.channelModelId)
  if (sourceIndex < 0 || targetIndex < 0) return
  const [item] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, item)
  routeDraft.value = next
}

function routeState(route: LogicalModelRouteRow): { label: string; type: 'success' | 'info' | 'warning' | 'danger' } {
  if (!route.routeEnabled) return { label: '已关闭路由', type: 'info' }
  if (route.providerStatus !== 'active') return { label: '渠道已停用', type: 'info' }
  if (route.modelStatus !== 'active') return { label: '模型已停用', type: 'info' }
  if (!route.hasActiveKey) return { label: '无可用 Key', type: 'danger' }
  return { label: '可路由', type: 'success' }
}

/** 纯 UI：原 EP tag type → Badge variant */
function tagVariant(type: 'success' | 'info' | 'warning' | 'danger') {
  const map = { success: 'success', info: 'secondary', warning: 'warning', danger: 'destructive' } as const
  return map[type]
}

function routeCostSummary(route: LogicalModelRouteRow): string {
  if (!route.costPricing) return '未配置成本价'
  return Object.entries(route.costPricing).map(([resolution, price]) => `${resolution} ${fmtCost(price)}`).join(' · ')
}

async function saveRouteConfig() {
  if (!routeEditing.value) return
  routeSaving.value = true
  try {
    await aiConfigApi.updateLogicalModelRouteConfig(
      routeEditing.value.id,
      routeDraft.value.map((route) => ({ channelModelId: route.channelModelId, enabled: route.routeEnabled })),
    )
    success('渠道路由配置已保存')
    routeDialog.value = false
    await loadAllLogicalModels()
  } catch (e) {
    error(e, '保存渠道路由配置失败')
  } finally {
    routeSaving.value = false
  }
}

// ── 存储配置（直接传 / 阿里云 OSS）──
const storageForm = ref<{
  mode: 'direct' | 'oss'
  endpoint: string
  bucket: string
  accessKeyId: string
  accessKeySecret: string
  resultImportWorkerUrl: string
}>({
  mode: 'direct',
  endpoint: '',
  bucket: '',
  accessKeyId: '',
  accessKeySecret: '',
  resultImportWorkerUrl: '',
})
const storageLoading = ref(false)
const storageSaving = ref(false)
const storageTesting = ref(false)
const storageTestResult = ref<{ ok: boolean; message: string } | null>(null)

async function loadStorageConfig() {
  storageLoading.value = true
  try {
    const res = await aiConfigApi.getStorageConfig()
    const d = res.data.data
    storageForm.value = {
      mode: d.mode,
      endpoint: d.oss.endpoint,
      bucket: d.oss.bucket,
      accessKeyId: d.oss.accessKeyId,
      accessKeySecret: d.oss.accessKeySecret,
      resultImportWorkerUrl: d.oss.resultImportWorkerUrl,
    }
  } catch (e) {
    error(e, '加载存储配置失败')
  } finally {
    storageLoading.value = false
  }
}

async function saveStorageConfig() {
  if (storageSaving.value) return
  storageSaving.value = true
  try {
    const f = storageForm.value
    await aiConfigApi.saveStorageConfig({
      mode: f.mode,
      oss: {
        endpoint: f.endpoint.trim(),
        bucket: f.bucket.trim(),
        accessKeyId: f.accessKeyId.trim(),
        accessKeySecret: f.accessKeySecret.trim(),
        resultImportWorkerUrl: f.resultImportWorkerUrl.trim(),
      },
    })
    success(f.mode === 'oss' ? '已切换为阿里云 OSS 存储' : '已切换为直接传模式（本机磁盘）')
    storageTestResult.value = null
    await loadStorageConfig()
  } catch (e: any) {
    error(e?.response?.data?.error || e, '保存存储配置失败')
  } finally {
    storageSaving.value = false
  }
}

async function testStorageConfig() {
  if (storageTesting.value) return
  storageTesting.value = true
  storageTestResult.value = null
  try {
    const f = storageForm.value
    const res = await aiConfigApi.testStorageConfig({
      endpoint: f.endpoint.trim(),
      bucket: f.bucket.trim(),
      accessKeyId: f.accessKeyId.trim(),
      accessKeySecret: f.accessKeySecret.trim(),
    })
    storageTestResult.value = res.data.data
  } catch (e: any) {
    storageTestResult.value = { ok: false, message: e?.response?.data?.error || '请求失败' }
  } finally {
    storageTesting.value = false
  }
}

onMounted(() => {
  loadAll()
  loadAdapters()
  loadDefaultVision()
  loadAllLogicalModels()
  loadStorageConfig()
})
</script>

<template>
  <PageLayout>
    <template #header>
      <div class="min-w-0">
        <h2>配置</h2>
        <p class="text-muted-foreground mt-1 text-sm">渠道接入 · 模型能力与成本 · Key 池与路由 · 图片存储</p>
      </div>
    </template>
    <template #extra>
      <div class="flex items-center gap-2" title="业务侧 AI 识别共用出口，如成套生图第一步的服装风格/季节识别">
        <span class="text-muted-foreground shrink-0 text-sm">默认识图模型</span>
        <Select
          :model-value="defaultVisionValue"
          :disabled="defaultVisionSaving"
          @update:model-value="(v) => saveDefaultVision(String(v))"
        >
          <SelectTrigger class="w-70">
            <SelectValue placeholder="未配置" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in visionModelOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          v-if="defaultVisionValue"
          variant="ghost"
          size="icon-sm"
          title="清除默认识图模型"
          :disabled="defaultVisionSaving"
          @click="saveDefaultVision('')"
        >
          <X />
        </Button>
      </div>
    </template>

    <Tabs v-model="activeTab">
      <TabsList>
        <TabsTrigger value="providers">服务商与模型</TabsTrigger>
        <TabsTrigger value="logical">逻辑模型</TabsTrigger>
        <TabsTrigger value="storage">存储</TabsTrigger>
      </TabsList>

      <!-- ═══ Tab 1：服务商与模型（渠道 / 渠道模型 / Key / 调试调用）═══ -->
      <TabsContent value="providers">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p class="text-muted-foreground min-w-0 flex-1 text-sm">管理平台渠道、渠道模型成本与 Key。每个渠道只使用优先级最高的启用 Key；调用失败后直接切换到下一渠道。</p>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground text-xs">{{ providers.length }} 个渠道</span>
            <Button @click="openProviderCreate"><Plus />新增服务商</Button>
            <Button variant="outline" :disabled="loading" @click="loadAll">
              <LoaderCircle v-if="loading" class="animate-spin" />
              <RefreshCw v-else />
              刷新
            </Button>
          </div>
        </div>

        <div class="flex min-h-100 flex-col items-stretch gap-4 lg:flex-row">
          <!-- 左：服务商列表 -->
          <aside class="flex max-h-180 w-full shrink-0 flex-col gap-2.5 overflow-y-auto lg:w-[300px]">
            <div
              v-for="p in providers"
              :key="p.id"
              class="cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:border-primary/50"
              :class="[
                p.id === selectedId ? 'border-primary ring-1 ring-primary ring-inset' : 'border-border',
                p.status !== 'active' && 'opacity-60',
              ]"
              @click="selectedId = p.id"
            >
              <div class="flex items-center gap-2">
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="p.status === 'active' ? 'bg-success' : 'bg-destructive'"
                />
                <span class="text-foreground min-w-0 truncate font-semibold">{{ p.name }}</span>
                <Badge variant="secondary">{{ p.adapter_label }}</Badge>
              </div>
              <div class="text-muted-foreground mt-1.5 truncate text-xs">{{ p.code }} · {{ p.base_url }}</div>
              <div class="text-muted-foreground mt-1.5 flex justify-between gap-2 text-xs">
                <span>Keys {{ p.keys.length }} · {{ p.models.length }} 模型</span>
                <span v-if="p.has_active_key" class="font-mono">{{ p.first_key_hint }}</span>
                <span v-else class="text-destructive font-mono" title="该渠道所有 Key 已停用或耗尽，其下模型实际不可用">
                  无可用 Key
                </span>
              </div>
            </div>
            <div v-if="loading" class="flex flex-col gap-2">
              <Skeleton class="h-20 w-full" />
              <Skeleton class="h-20 w-full" />
            </div>
            <div v-else-if="!providers.length" class="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              还没有服务商，点击右上角「新增服务商」开始配置。
            </div>
          </aside>

          <!-- 右：所选服务商详情 -->
          <section v-if="selected" class="min-w-0 flex-1 rounded-lg border bg-card p-4">
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold">{{ selected.name }}</h3>
                  <Badge variant="outline">{{ selected.adapter_label }}</Badge>
                  <Badge :variant="selected.status === 'active' ? 'success' : 'destructive'">
                    {{ selected.status === 'active' ? '已启用' : '已停用' }}
                  </Badge>
                  <Badge v-if="selected.display_name" variant="secondary">用户可见：{{ selected.display_name }}</Badge>
                </div>
                <p class="text-muted-foreground mt-1 font-mono text-xs break-all">{{ selected.base_url }}</p>
              </div>
              <div class="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="outline" :disabled="testingProvider" @click="testProvider(selected)">
                  <LoaderCircle v-if="testingProvider" class="animate-spin" />
                  <Unplug v-else />
                  测试连接
                </Button>
                <Button variant="outline" @click="openProviderEdit(selected)"><Pencil />编辑</Button>
                <Button variant="destructive" @click="deleteProvider(selected)"><Trash2 />删除</Button>
              </div>
            </div>
            <p v-if="selected.remark" class="text-muted-foreground mt-2 text-sm">{{ selected.remark }}</p>

            <Separator class="my-3" />

            <Tabs v-model="detailTab">
              <TabsList>
                <TabsTrigger value="models">模型管理</TabsTrigger>
                <TabsTrigger value="keys">Key 管理</TabsTrigger>
                <TabsTrigger value="debug">调试调用</TabsTrigger>
              </TabsList>

              <!-- Tab 1：模型管理 -->
              <TabsContent value="models">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span class="text-muted-foreground min-w-0 flex-1 text-xs">模型归属于该服务商；支持生图的模型必定支持识图。</span>
                  <Button size="sm" @click="openModelCreate"><Plus />新增模型</Button>
                </div>
                <div class="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>模型 ID</TableHead>
                        <TableHead>显示名</TableHead>
                        <TableHead class="w-20 text-center">识图</TableHead>
                        <TableHead class="w-20 text-center">生图</TableHead>
                        <TableHead class="w-20 text-center">文字</TableHead>
                        <TableHead>逻辑模型</TableHead>
                        <TableHead>成本价（元/张）</TableHead>
                        <TableHead class="w-20 text-center">状态</TableHead>
                        <TableHead>备注</TableHead>
                        <TableHead class="w-32 text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="row in selected.models" :key="row.id">
                        <TableCell class="max-w-50 truncate" :title="row.model_id">{{ row.model_id }}</TableCell>
                        <TableCell class="max-w-36 truncate" :title="row.display_name">{{ row.display_name || '—' }}</TableCell>
                        <TableCell class="text-center">
                          <Badge v-if="row.supports_vision" variant="success">识图</Badge>
                          <span v-else class="text-muted-foreground/60">—</span>
                        </TableCell>
                        <TableCell class="text-center">
                          <Badge v-if="row.supports_image_gen" variant="warning">生图</Badge>
                          <span v-else class="text-muted-foreground/60">—</span>
                        </TableCell>
                        <TableCell class="text-center">
                          <Badge v-if="row.supports_chat" variant="secondary">文字</Badge>
                          <span v-else class="text-muted-foreground/60">—</span>
                        </TableCell>
                        <TableCell class="max-w-44 truncate" :title="row.logical_code || ''">
                          <Badge v-if="row.logical_code" variant="outline">{{ row.logical_code }}</Badge>
                          <span v-else class="text-muted-foreground/60">—</span>
                        </TableCell>
                        <TableCell class="max-w-44 truncate" :title="row.cost_pricing ? Object.entries(row.cost_pricing).map(([r, p]) => `${r}:¥${p}`).join(' · ') : ''">
                          <span v-if="row.cost_pricing && Object.keys(row.cost_pricing).length" class="font-mono text-xs">
                            {{ Object.entries(row.cost_pricing).map(([r, p]) => `${r}:¥${p}`).join(' · ') }}
                          </span>
                          <span v-else-if="row.supports_image_gen" class="text-muted-foreground/60">未配置</span>
                          <span v-else class="text-muted-foreground/60">—</span>
                        </TableCell>
                        <TableCell class="text-center">
                          <Switch
                            :model-value="row.status === 'active'"
                            @update:model-value="(v: boolean) => toggleModelStatus(row, v)"
                          />
                        </TableCell>
                        <TableCell class="max-w-36 truncate" :title="row.remark">{{ row.remark || '—' }}</TableCell>
                        <TableCell class="text-center">
                          <div class="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm"  @click="openModelEdit(row)"><Pencil />编辑</Button>
                            <Button variant="destructive" size="sm"  @click="deleteModel(row)"><Trash2 />删除</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableEmpty v-if="!selected.models.length" :colspan="10">
                        <UiEmptyState title="暂无模型" />
                      </TableEmpty>
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <!-- Tab 2：Key 池管理 -->
              <TabsContent value="keys">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span class="text-muted-foreground min-w-0 flex-1 text-xs">Key 明文存储、可查看复制；调用按优先级（小者优先）取第一个可用 Key，上游欠费自动切换到下一个。</span>
                  <Button size="sm" @click="openKeyCreate"><Key />新增 Key</Button>
                </div>
                <div class="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead class="w-20 text-center">优先级</TableHead>
                        <TableHead class="w-32 text-center">状态</TableHead>
                        <TableHead>最近检测</TableHead>
                        <TableHead class="w-56 text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="row in selected.keys" :key="row.id">
                        <TableCell class="max-w-32 truncate" :title="row.name">{{ row.name }}</TableCell>
                        <TableCell>
                          <div v-if="row.key" class="flex min-w-0 items-center gap-1">
                            <code class="min-w-0 flex-1 truncate font-mono text-sm" :title="row.key">{{ row.key }}</code>
                            <Button
                              variant="ghost" size="sm"
                              @click="copy(row.key, { successMsg: 'Key 已复制' })"
                            ><Copy />复制</Button>
                          </div>
                          <code
                            v-else
                            class="font-mono text-sm"
                            title="历史加密数据无法读取：编辑该 Key 重新保存一次即可查看与复制"
                          >{{ row.key_hint || '—' }}（不可读）</code>
                        </TableCell>
                        <TableCell class="text-center">
                          <Badge variant="outline">{{ row.priority }}</Badge>
                        </TableCell>
                        <TableCell class="text-center">
                          <Switch
                            v-if="row.status !== 'exhausted'"
                            :model-value="row.status === 'active'"
                            @update:model-value="(v: boolean) => toggleKeyStatus(row, v)"
                          />
                          <Badge
                            v-else
                            variant="destructive"
                            :title="`耗尽时间：${row.exhausted_at || '—'}（上游判定欠费/额度耗尽，已自动停用轮换）`"
                          >已耗尽</Badge>
                        </TableCell>
                        <TableCell>
                          <template v-if="row.last_checked_at">
                            <span :class="row.last_check_ok ? 'text-success' : 'text-destructive'">
                              {{ row.last_check_ok ? '正常' : '异常' }}
                            </span>
                            <span class="text-muted-foreground ml-1.5 text-xs">{{ row.last_checked_at }}</span>
                          </template>
                          <span v-else class="text-muted-foreground/60">未检测</span>
                        </TableCell>
                        <TableCell class="text-center">
                          <div class="flex items-center justify-center gap-1">
                            <Button
                              v-if="row.status === 'exhausted'"
                              variant="ghost" size="sm"
                              @click="reactivateKey(row)"
                            >重新启用</Button>
                            <Button
                              variant="ghost" size="sm"
                              :disabled="testingKeyId === row.id"
                              @click="testKey(row)"
                            >
                              <LoaderCircle v-if="testingKeyId === row.id" class="animate-spin" />
                              测试
                            </Button>
                            <Button variant="ghost" size="sm"  @click="openKeyEdit(row)"><Pencil />编辑</Button>
                            <Button variant="destructive" size="sm"  @click="deleteKey(row)"><Trash2 />删除</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableEmpty v-if="!selected.keys.length" :colspan="6">
                        <UiEmptyState title="暂无 Key" />
                      </TableEmpty>
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <!-- Tab 3：调试调用 -->
              <TabsContent value="debug">
                <div class="flex w-full max-w-[760px] flex-col gap-4">
                  <div class="grid gap-1.5">
                    <Label for="debug-model">模型</Label>
                    <Select v-model="debugModel">
                      <SelectTrigger id="debug-model" class="w-full sm:w-80">
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="m in activeModels"
                          :key="m.id"
                          :value="m.model_id"
                        >
                          <span class="flex items-center gap-1">
                            <span>{{ m.display_name || m.model_id }}</span>
                            <Badge v-if="m.supports_vision" variant="success">识图</Badge>
                            <Badge v-if="m.supports_image_gen" variant="warning">生图</Badge>
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="grid gap-1.5">
                    <Label for="debug-prompt">提示词</Label>
                    <Textarea
                      id="debug-prompt"
                      v-model="debugPrompt" :rows="3"
                      placeholder="输入调试提示词"
                    />
                  </div>
                  <div class="grid gap-1.5">
                    <Label>图片</Label>
                    <div class="flex flex-wrap items-center gap-2.5">
                      <DsFileInput
                        ref="debugFileInput"
                        type="file"
                        accept="image/*"
                        class="hidden"
                        :disabled="!debugModelRow?.supports_vision"
                        @change="onDebugFileInput"
                      />
                      <Button variant="outline" :disabled="!debugModelRow?.supports_vision" @click="debugFileInput?.click()">
                        <Upload />
                        {{ debugImage ? '重新选择图片' : '选择图片' }}
                      </Button>
                      <template v-if="debugImage">
                        <DsThumbnail :src="debugImage.dataUrl" class="media-tile size-14" alt="调试图片" />
                        <span class="text-muted-foreground max-w-56 truncate text-xs">{{ debugImage.name }}（{{ debugImage.mimeType }}）</span>
                        <Button variant="ghost" size="sm"  @click="debugImage = null">移除</Button>
                      </template>
                    </div>
                    <p v-if="debugModelRow && !debugModelRow.supports_vision" class="text-muted-foreground/60 text-xs">
                      所选模型不支持识图
                    </p>
                    <p v-else class="text-muted-foreground text-xs">仅「支持识图」的模型可上传图片</p>
                  </div>
                  <div>
                    <Button :disabled="debugCalling || !debugModel" @click="runDebug">
                      <LoaderCircle v-if="debugCalling" class="animate-spin" />
                      <MessageCircle v-else />
                      调用（走第一个可用 Key）
                    </Button>
                  </div>

                  <Alert v-if="debugError" variant="destructive">
                    <CircleX />
                    <AlertDescription class="whitespace-pre-wrap">{{ debugError }}</AlertDescription>
                  </Alert>
                  <div v-if="debugResult" class="flex flex-col gap-2">
                    <p class="text-muted-foreground text-xs">
                      耗时 {{ debugResult.latencyMs }}ms
                      <template v-if="debugResult.usage">
                        · 输入 {{ debugResult.usage.promptTokens ?? '—' }} tok / 输出 {{ debugResult.usage.completionTokens ?? '—' }} tok
                      </template>
                    </p>
                    <pre class="text-foreground bg-muted rounded-lg p-3.5 text-sm leading-relaxed break-words whitespace-pre-wrap">{{ debugResult.text }}</pre>
                    <Collapsible>
                      <CollapsibleTrigger class="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                        思维链（reasoning_content）
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre class="text-muted-foreground mt-2 text-xs leading-relaxed break-words whitespace-pre-wrap">{{ debugResult.reasoning }}</pre>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          <section v-else-if="!loading" class="min-w-0 flex-1 rounded-lg border bg-card">
            <div class="flex h-full min-h-80 items-center justify-center">
              <UiEmptyState title="选择左侧服务商查看详情，或新增一个服务商" />
            </div>
          </section>
        </div>
      </TabsContent>

      <!-- ═══ Tab 2：逻辑模型（代码内置清单，仅显示名可改）═══ -->
      <TabsContent value="logical">
        <section class="rounded-lg border bg-card p-4">
          <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 class="text-sm font-semibold">逻辑模型</h3>
            <span class="text-muted-foreground min-w-0 flex-1 text-xs">标准模型能力由平台代码定义；管理员维护显示名和前台统一售卖价。</span>
          </div>
          <!-- 滚动盒必须是 Table 自带的 table-container：外层 div 滚动时 sticky 表头会被内层 overflow-x-auto 容器吃掉（同 MyQuotaPage） -->
          <div class="overflow-hidden rounded-lg border ">
            <Table >
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>显示名</TableHead>
                  <TableHead class="w-20 text-center">类型</TableHead>
                  <TableHead>能力定义</TableHead>
                  <TableHead class="min-w-80">统一售卖价（积分/张）</TableHead>
                  <TableHead class="w-28 text-center">关联渠道模型</TableHead>
                  <TableHead class="w-24 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in allLogicalModels" :key="row.id">
                  <TableCell class="max-w-56 truncate" :title="row.code">{{ row.code }}</TableCell>
                  <TableCell>
                    <Input
                      v-if="renamingId === row.id"
                      v-model="renamingValue"  maxlength="100"
                      @keyup.enter="commitRename(row)"
                      @keyup.esc="renamingId = null"
                      @blur="commitRename(row)"
                    />
                    <div v-else class="flex min-h-6 items-center gap-1.5">
                      <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
                      <Button variant="ghost" size="sm"  @click="startRename(row)"><Pencil />改名</Button>
                    </div>
                  </TableCell>
                  <TableCell class="text-center">
                    <Badge :variant="row.kind === 'image' ? 'warning' : 'secondary'">
                      {{ row.kind === 'image' ? '生图' : '文字' }}
                    </Badge>
                  </TableCell>
                  <TableCell class="max-w-64 truncate" :title="logicalCapabilitySummary(row)">{{ logicalCapabilitySummary(row) }}</TableCell>
                  <TableCell>
                    <div v-if="row.kind === 'image'" class="flex w-full flex-col gap-1.5">
                      <div v-for="resolution in (row.defaultParams.resolutions || [])" :key="resolution" class="flex flex-wrap items-center gap-2.5">
                        <span class="inline-flex min-w-15 items-center gap-1 text-xs font-semibold">
                          {{ resolution }}
                          <Tooltip>
                            <TooltipTrigger as-child>
                              <CircleHelp class="text-muted-foreground hover:text-primary size-3.5 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" class="max-w-90">
                              <div class="cost-tip">
                                <div class="cost-tip-title">各渠道成本价 · {{ row.name }} · {{ resolution }}</div>
                                <template v-if="costEntries(row.id, resolution).length">
                                  <div
                                    v-for="(c, i) in costEntries(row.id, resolution)"
                                    :key="i"
                                    class="cost-tip-row"
                                    :class="{ 'cost-tip-disabled': c.disabled }"
                                  >
                                    <span class="cost-tip-name">{{ c.channel }} · {{ c.model }}<template v-if="c.disabled">（已停用）</template></span>
                                    <b>{{ fmtCost(c.price) }}</b>
                                  </div>
                                </template>
                                <div v-else class="cost-tip-empty">暂无配置该分辨率成本价的渠道</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                        <div class="w-32 shrink-0">
                          <UiNumberInput
                            :model-value="row.salePricing?.[resolution]"
                            :min="0" :step="0.01" :precision="2"
                            @update:model-value="(v) => setSalePrice(row, resolution, v)"
                          />
                        </div>
                      </div>
                      <Button size="sm" variant="outline" class="mt-2 w-fit" @click="saveSalePricing(row)">保存售价</Button>
                    </div>
                    <span v-else class="text-muted-foreground/60">—</span>
                  </TableCell>
                  <TableCell class="text-center">{{ row.modelCount }}</TableCell>
                  <TableCell class="text-center">
                    <Button v-if="row.kind === 'image'" variant="ghost" size="sm"  @click="openRouteEditor(row)">
                      <Pencil />编辑
                    </Button>
                    <span v-else class="text-muted-foreground/60">—</span>
                  </TableCell>
                </TableRow>
                <TableEmpty v-if="!allLogicalModels.length" :colspan="7">
                  <UiEmptyState title="暂无数据" />
                </TableEmpty>
              </TableBody>
            </Table>
          </div>
        </section>
      </TabsContent>

      <!-- ═══ Tab 3：存储（直接传 / 阿里云 OSS）═══ -->
      <TabsContent value="storage">
        <section class="w-full max-w-160 rounded-lg border bg-card p-4">
          <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 class="text-sm font-semibold">图片存储模式</h3>
            <span class="text-muted-foreground min-w-0 flex-1 text-xs">参考图、结果图与素材库存放位置。配置仅存数据库（不入代码仓库），切换后立即生效、无需重启。</span>
          </div>

          <div v-if="storageLoading" class="flex flex-col gap-3">
            <Skeleton class="h-8 w-64" />
            <Skeleton class="h-20 w-full" />
          </div>
          <template v-else>
          <ToggleGroup
            type="single" variant="outline"
            :model-value="storageForm.mode"
            @update:model-value="(v) => { if (v) storageForm.mode = String(v) as 'direct' | 'oss' }"
          >
            <ToggleGroupItem value="direct">直接传（默认）</ToggleGroupItem>
            <ToggleGroupItem value="oss">阿里云 OSS</ToggleGroupItem>
          </ToggleGroup>
          <p class="text-muted-foreground mt-2 mb-4 text-xs leading-[1.7]">
            {{ storageForm.mode === 'direct'
              ? '图片保存在本机磁盘（server/data/uploads/），由本站 /api/files/ 提供访问；参考图提交时直传 AI 渠道（ToAPIs 走官方上传接口，OpenAI 兼容/火山走 base64）。无需任何云存储与 CORS 配置，适合自部署与开源开箱即用。'
              : '浏览器直传 OSS bucket（需 bucket 允许跨域 POST），结果图经转存 Worker 流式入桶。适合已有阿里云 OSS 的部署，图片走 CDN 公网分发。' }}
          </p>

          <template v-if="storageForm.mode === 'oss'">
            <div class="mb-4 grid gap-3.5 sm:grid-cols-2">
              <div class="grid gap-1">
                <Label for="oss-endpoint" class="text-xs font-semibold">Endpoint</Label>
                <Input id="oss-endpoint" v-model="storageForm.endpoint" placeholder="oss-cn-hangzhou.aliyuncs.com" maxlength="120" />
                <span class="text-muted-foreground text-xs">OSS 地域域名，不含 bucket 名</span>
              </div>
              <div class="grid gap-1">
                <Label for="oss-bucket" class="text-xs font-semibold">Bucket <span class="text-destructive">*</span></Label>
                <Input id="oss-bucket" v-model="storageForm.bucket" placeholder="your-bucket-name" maxlength="120" />
                <span class="text-muted-foreground text-xs">需开启公共读（图片 URL 直接展示）并配置 CORS 允许 POST</span>
              </div>
              <div class="grid gap-1">
                <Label for="oss-ak" class="text-xs font-semibold">AccessKey ID <span class="text-destructive">*</span></Label>
                <Input id="oss-ak" v-model="storageForm.accessKeyId" maxlength="120" />
              </div>
              <div class="grid gap-1">
                <Label for="oss-sk" class="text-xs font-semibold">AccessKey Secret <span class="text-destructive">*</span></Label>
                <Input id="oss-sk" v-model="storageForm.accessKeySecret" type="password" maxlength="120" />
                <span class="text-muted-foreground text-xs">仅存本站数据库，不会写入代码仓库</span>
              </div>
              <div class="grid gap-1 sm:col-span-2">
                <Label for="oss-worker" class="text-xs font-semibold">结果转存 Worker URL</Label>
                <Input id="oss-worker" v-model="storageForm.resultImportWorkerUrl" placeholder="选填；不配则结果转存改由服务端直接下载上传" maxlength="300" />
                <span class="text-muted-foreground text-xs">流式转存函数（FC Worker）地址；直接传模式下不需要</span>
              </div>
            </div>
          </template>

          <Alert
            v-if="storageTestResult"
            :variant="storageTestResult.ok ? 'default' : 'destructive'"
            class="mb-3"
          >
            <CircleCheck v-if="storageTestResult.ok" />
            <CircleX v-else />
            <AlertDescription>{{ storageTestResult.message }}</AlertDescription>
          </Alert>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <Button v-if="storageForm.mode === 'oss'" variant="outline" :disabled="storageTesting" @click="testStorageConfig">
              <LoaderCircle v-if="storageTesting" class="animate-spin" />
              测试连接
            </Button>
            <Button :disabled="storageSaving" @click="saveStorageConfig">
              <LoaderCircle v-if="storageSaving" class="animate-spin" />
              保存
            </Button>
          </div>
          </template>
        </section>
      </TabsContent>
    </Tabs>

    <!-- 服务商弹窗 -->
    <Dialog :open="providerDialog" @update:open="(v: boolean) => (providerDialog = v)">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ providerEditing ? '编辑服务商' : '新增服务商' }}</DialogTitle>
        </DialogHeader>
        <div v-if="providerDialog" class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label for="provider-name">名称 <span class="text-destructive">*</span></Label>
            <Input id="provider-name" v-model="providerForm.name" placeholder="如：火山引擎" maxlength="100" />
          </div>
          <div class="grid gap-1.5">
            <Label for="provider-display-name">用户可见名</Label>
            <Input id="provider-display-name" v-model="providerForm.display_name" placeholder="选填，如 TA；留空则向用户显示「名称」" maxlength="100" />
            <div class="form-hint">模型下拉、计费说明等用户侧界面显示此名（用于隐藏真实渠道商）；管理后台始终显示真实名称。留空 = 显示「名称」。</div>
          </div>
          <div class="grid gap-1.5">
            <Label for="provider-code">标识</Label>
            <Input
              id="provider-code"
              v-model="providerForm.code" placeholder="选填，留空自动生成；小写字母/数字/中划线，如 volcengine"
              :disabled="!!providerEditing" maxlength="50"
            />
            <div class="form-hint">机器用的唯一英文标识（任务记录溯源用），不影响协议与调用；创建后不可改。</div>
          </div>
          <div class="grid gap-1.5">
            <Label for="provider-adapter">连接方式 <span class="text-destructive">*</span></Label>
            <Select v-model="providerForm.adapter">
              <SelectTrigger id="provider-adapter" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent class="max-w-120">
                <SelectItem v-for="a in adapters" :key="a.code" :value="a.code">
                  <div class="flex max-w-full items-center justify-between gap-3">
                    <span class="shrink-0">{{ a.label }}</span>
                    <span class="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs">{{ a.description }}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <div class="form-hint">
              {{ adapters.find((a) => a.code === providerForm.adapter)?.description || '协议兼容 OpenAI 的服务商直接选「OpenAI 兼容生图」' }}
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label for="provider-base-url">Base URL <span class="text-destructive">*</span></Label>
            <Input id="provider-base-url" v-model="providerForm.base_url" placeholder="https://your-api.example.com" />
            <div class="form-hint">填站点根地址即可，一般无需带 /v1（带 /v1 也能自动兼容）。</div>
          </div>
          <div class="grid gap-1.5">
            <Label for="provider-remark">备注</Label>
            <Textarea id="provider-remark" v-model="providerForm.remark" :rows="2" placeholder="选填" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="providerDialog = false">取消</Button>
          <Button :disabled="providerSubmitting" @click="submitProvider">
            <LoaderCircle v-if="providerSubmitting" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 模型弹窗（渠道模型：关联逻辑模型 + 能力覆盖 + 定价） -->
    <Dialog :open="modelDialog" @update:open="(v: boolean) => (modelDialog = v)">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ modelEditing ? '编辑模型' : '新增模型' }}</DialogTitle>
        </DialogHeader>
        <div v-if="modelDialog" class="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          <div class="grid gap-1.5">
            <Label for="model-id">模型 ID <span class="text-destructive">*</span></Label>
            <Input id="model-id" v-model="modelForm.model_id" placeholder="调用 API 时使用的模型名（渠道叫法），如 gpt-4o-image" />
            <div class="form-hint">同一逻辑模型在不同渠道可不同名（渠道映射语义）</div>
          </div>
          <div class="grid gap-1.5">
            <Label for="model-display-name">显示名</Label>
            <Input id="model-display-name" v-model="modelForm.display_name" placeholder="选填，默认取逻辑模型名" />
          </div>

          <Separator class="my-1" />

          <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                :model-value="modelForm.supports_vision"
                :disabled="modelForm.supports_image_gen"
                @update:model-value="(v) => modelForm.supports_vision = v === true"
              />
              支持识图
            </label>
            <span v-if="modelForm.supports_image_gen" class="form-hint min-w-0 flex-1">生图模型必定支持识图，已自动勾选</span>
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox :model-value="modelForm.supports_image_gen" @update:model-value="onGenChange" />
              支持生图
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                :model-value="modelForm.supports_chat"
                @update:model-value="(v) => modelForm.supports_chat = v === true"
              />
              支持文字
            </label>
          </div>
          <div class="form-hint">支持识图 = 支持上传图片作为输入；支持生图 = 支持输出图片（勾选后自动要求支持识图）；支持文字 = 支持文字调用（画布文字 AI 节点可选；不计积分）</div>

          <div v-if="modelForm.supports_image_gen" class="grid gap-1.5">
            <Label for="model-logical">逻辑模型 <span class="text-destructive">*</span></Label>
            <Select
              :model-value="modelForm.logical_model_id === null ? undefined : String(modelForm.logical_model_id)"
              @update:model-value="(v) => { modelForm.logical_model_id = Number(v) }"
            >
              <SelectTrigger id="model-logical" class="w-full">
                <SelectValue placeholder="选择逻辑模型（继承能力定义）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="lm in logicalModels" :key="lm.id" :value="String(lm.id)">
                  {{ lm.name }}（{{ lm.code }}）
                </SelectItem>
              </SelectContent>
            </Select>
            <div v-if="modelLogical" class="form-hint">
              模板能力：{{ modelLogical.defaultParams?.resolutions?.join(' / ') || '—' }}；
              宽高比 {{ (modelLogical.defaultParams?.aspectRatios?.length ?? 0) }} 种；
              参考图 ≤ {{ modelLogical.defaultParams?.maxReferenceImages ?? '—' }}
            </div>
          </div>

          <div v-if="modelForm.supports_image_gen && modelLogical" class="grid gap-1.5">
            <Label>能力覆盖</Label>
            <div class="w-full rounded-lg border border-dashed p-2.5">
              <div class="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 last:mb-0">
                <span class="text-muted-foreground w-36 shrink-0 text-xs">分辨率（不勾=全部继承）</span>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <label
                    v-for="r in (modelLogical.defaultParams?.resolutions || [])"
                    :key="r"
                    class="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <Checkbox
                      :model-value="modelForm.overrideResolutions.includes(r)"
                      @update:model-value="(v) => modelForm.overrideResolutions = toggleArrayValue(modelForm.overrideResolutions, r, v === true)"
                    />
                    {{ r }}
                  </label>
                </div>
              </div>
              <!-- TODO(multiple-select): 原 EP Select 多选（multiple + collapse-tags）无对应物，改为 Popover + Checkbox 列表（值仍为字符串数组，语义等价） -->
              <div class="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 last:mb-0">
                <span class="text-muted-foreground w-36 shrink-0 text-xs">宽高比（不勾=全部继承）</span>
                <Popover>
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      class="min-w-0 flex-1 justify-between sm:max-w-[420px]"
                    >
                      <span class="truncate">
                        {{ modelForm.overrideRatios.length ? modelForm.overrideRatios.join('、') : '全部继承' }}
                      </span>
                      <ChevronDown class="size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="max-h-72 w-64 overflow-y-auto p-2" align="start">
                    <label
                      v-for="r in modelLogicalRatios"
                      :key="r"
                      class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                    >
                      <Checkbox
                        :model-value="modelForm.overrideRatios.includes(r)"
                        @update:model-value="(v) => modelForm.overrideRatios = toggleArrayValue(modelForm.overrideRatios, r, v === true)"
                      />
                      {{ r }}
                    </label>
                  </PopoverContent>
                </Popover>
              </div>
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-2 last:mb-0">
                <span class="text-muted-foreground w-36 shrink-0 text-xs">上限收窄（选填）</span>
                <div class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  参考图 ≤
                  <div class="w-32 shrink-0">
                    <UiNumberInput
                      :model-value="modelForm.overrideMaxRef ?? undefined"
                      :min="0" :max="modelLogical.defaultParams?.maxReferenceImages ?? 20"
                      @update:model-value="(v) => modelForm.overrideMaxRef = v ?? null"
                    />
                  </div>
                  提示词 ≤
                  <div class="w-36 shrink-0">
                    <UiNumberInput
                      :model-value="modelForm.overrideMaxPromptChars ?? undefined"
                      :min="100" :max="modelLogical.defaultParams?.maxPromptChars ?? 32000" :step="500"
                      @update:model-value="(v) => modelForm.overrideMaxPromptChars = v ?? null"
                    />
                  </div>
                </div>
              </div>
              <div class="form-hint mt-1">覆盖只允许收窄（不能超出逻辑模型能力）；生效能力即时反映在定价行</div>
            </div>
          </div>

          <div v-if="modelForm.supports_image_gen && modelLogical" class="grid gap-1.5">
            <Label>成本价 <span class="text-destructive">*</span></Label>
            <div class="w-full rounded-lg border border-dashed p-2.5">
              <div v-for="r in modelEffectiveResolutions" :key="r" class="mb-1.5 flex flex-wrap items-center gap-2.5 last:mb-0">
                <span class="w-15 font-semibold">{{ r }}</span>
                <div class="w-35 shrink-0">
                  <UiNumberInput
                    :model-value="modelForm.costPricing[r]"
                    :min="0" :step="0.01" :precision="2"
                    @update:model-value="(v) => modelForm.costPricing[r] = v as number"
                  />
                </div>
                <span class="text-muted-foreground text-xs">元 / 张</span>
              </div>
              <div v-if="modelEffectiveResolutions.length === 0" class="form-hint">生效能力为空（覆盖过度收窄），请调整</div>
            </div>
          </div>

          <Separator class="my-1" />

          <div class="grid gap-1.5">
            <Label for="model-remark">备注</Label>
            <Textarea id="model-remark" v-model="modelForm.remark" :rows="2" placeholder="选填" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="modelDialog = false">取消</Button>
          <Button :disabled="modelSubmitting" @click="submitModel">
            <LoaderCircle v-if="modelSubmitting" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 逻辑模型渠道优先路由弹窗 -->
    <Dialog :open="routeDialog" @update:open="(v: boolean) => (routeDialog = v)">
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{{ `编辑逻辑模型 · ${routeEditing?.name || ''}` }}</DialogTitle>
        </DialogHeader>
        <div v-if="routeDialog">
          <div class="route-editor-intro">
            <div>
              <strong>{{ routeEditing?.code }}</strong>
              <span>开启“参与路由”的渠道才会按下方顺序尝试；成本价只用于诊断，不参与排序。</span>
            </div>
            <Badge variant="secondary">全分辨率共用</Badge>
          </div>

          <div v-if="routeDraft.length" class="route-list" role="list" aria-label="渠道优先路由顺序">
            <div
              v-for="(route, index) in routeDraft"
              :key="route.channelModelId"
              class="route-item"
              :class="{
                'route-item-dragging': draggedRouteId === route.channelModelId,
                'route-item-disabled': !route.routeEnabled,
              }"
              role="listitem"
              draggable="true"
              @dragstart="startRouteDrag($event, route)"
              @dragend="draggedRouteId = null"
              @dragover.prevent
              @drop.prevent="dropRoute(route)"
            >
              <Button variant="ghost"
                type="button"
                class="route-drag-handle"
                :aria-label="`拖动调整 ${route.providerName} 的顺序`"
                title="按住拖动调整顺序"
              >
                <GripVertical class="size-4" />
              </Button>
              <span class="route-index">{{ index + 1 }}</span>
              <div class="route-main">
                <div class="route-title-row">
                  <strong>{{ route.providerName }}</strong>
                  <span class="route-model-name">{{ route.modelName }}</span>
                  <Badge :variant="tagVariant(routeState(route).type)">
                    {{ routeState(route).label }}
                  </Badge>
                </div>
                <div class="route-meta">
                  <code>{{ route.modelId }}</code>
                  <span>{{ routeCostSummary(route) }}</span>
                </div>
              </div>
              <div class="route-toggle">
                <span>参与路由</span>
                <Switch
                  :model-value="route.routeEnabled"
                  draggable="false"
                  :aria-label="`${route.providerName} 参与当前逻辑模型路由`"
                  @update:model-value="(v: boolean) => route.routeEnabled = v"
                />
              </div>
              <div class="route-keyboard-actions" aria-label="键盘调整顺序">
                <Button
                  variant="outline" size="icon-sm" :disabled="index === 0"
                  :aria-label="`上移 ${route.providerName}`" title="上移"
                  @click="moveRoute(index, -1)"
                ><ArrowUp /></Button>
                <Button
                  variant="outline" size="icon-sm" :disabled="index === routeDraft.length - 1"
                  :aria-label="`下移 ${route.providerName}`" title="下移"
                  @click="moveRoute(index, 1)"
                ><ArrowDown /></Button>
              </div>
            </div>
          </div>
          <UiEmptyState v-else title="该逻辑模型尚未接入生图渠道" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="routeDialog = false">取消</Button>
          <Button :disabled="routeSaving || routeDraft.length === 0" @click="saveRouteConfig">
            <LoaderCircle v-if="routeSaving" class="animate-spin" />
            保存路由配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Key 弹窗 -->
    <Dialog :open="keyDialog" @update:open="(v: boolean) => { keyDialog = v; if (!v) showKeyInput = false }">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ keyEditing ? '编辑 Key' : '新增 Key' }}</DialogTitle>
        </DialogHeader>
        <div v-if="keyDialog" class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label for="key-name">名称 <span class="text-destructive">*</span></Label>
            <Input id="key-name" v-model="keyForm.name" placeholder="如：生产 Key A / 备用-充值卡B" maxlength="100" />
          </div>
          <div class="grid gap-1.5">
            <Label for="key-value">{{ keyEditing ? '新 Key' : 'API Key' }}<span v-if="!keyEditing" class="text-destructive"> *</span></Label>
            <div class="relative">
              <Input
                id="key-value"
                v-model="keyForm.key"
                :type="showKeyInput ? 'text' : 'password'"
                :placeholder="keyEditing ? '留空表示不修改 Key 内容' : 'ark-... / sk-...'"

              />
              <Button variant="ghost"
                type="button"
                class="absolute top-1/2 right-2.5 -translate-y-1/2"
                :title="showKeyInput ? '隐藏密码' : '显示密码'"
                @click="showKeyInput = !showKeyInput"
              >
                <EyeOff v-if="showKeyInput" class="size-4" />
                <Eye v-else class="size-4" />
              </Button>
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label>优先级 <span class="text-destructive">*</span></Label>
            <div class="w-40">
              <UiNumberInput
                :model-value="keyForm.priority ?? undefined"
                :min="1" :step="1" :precision="0" step-strictly
                :disabled="keyEditing?.status === 'exhausted'"
                @update:model-value="(v) => keyForm.priority = v ?? null"
              />
            </div>
            <div v-if="keyEditing?.status === 'exhausted'" class="form-hint">已耗尽的 Key 不能修改优先级，请先重新启用或删除</div>
            <div v-else class="form-hint">正整数，数字越小越先用；同优先级按录入先后排序</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="keyDialog = false">取消</Button>
          <Button :disabled="keySubmitting" @click="submitKey">
            <LoaderCircle v-if="keySubmitting" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>

<style scoped>
.form-hint {
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
  line-height: 1.6;
}

/* ── 逻辑模型渠道优先路由 ── */
.route-editor-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ds-space-3);
  margin-bottom: var(--ds-space-3);
  padding: var(--ds-space-2) var(--ds-space-3);
  border: 1px solid var(--border);
  border-radius: var(--ds-radius);
  background: var(--muted);
}
.route-editor-intro > div {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-1);
  min-width: 0;
}
.route-editor-intro span {
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
  line-height: 1.6;
}
.route-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
  max-height: var(--ds-dialog-width);
  overflow-y: auto;
}
.route-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: calc(var(--ds-space-8) * 2);
  padding: var(--ds-space-2) var(--ds-space-3);
  border: 1px solid var(--border);
  border-radius: var(--ds-radius);
  background: var(--card);
  transition: border-color var(--ds-motion-fast), background-color var(--ds-motion-fast), opacity var(--ds-motion-fast);
}
.route-item:hover {
  border-color: var(--border);
  background: var(--accent);
}
.route-item-disabled {
  background: var(--muted);
}
.route-item-disabled .route-main {
  opacity: 0.72;
}
.route-item-dragging { opacity: 0.55; }
.route-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ds-space-7);
  height: var(--ds-control-height);
  padding: 0;

  cursor: grab;
}
.route-drag-handle:active { cursor: grabbing; }
.route-drag-handle:focus-visible {

  outline-offset: 2px;

}
.route-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ds-space-6);
  height: var(--ds-space-6);
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
  font-weight: var(--ds-weight-heading);
}
.route-main { flex: 1; min-width: 0; }
.route-title-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  min-width: 0;
}
.route-model-name {
  min-width: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-2) var(--ds-space-3);
  margin-top: var(--ds-space-1);
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
}
.route-meta code {
  color: var(--muted-foreground);
  word-break: break-all;
}
.route-toggle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-1);
  flex-shrink: 0;
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
}
.route-keyboard-actions {
  display: flex;
  gap: var(--ds-space-1);
  flex-shrink: 0;
}
</style>

<style>
/* 成本价 tooltip 内容挂载在 body 下，scoped 样式不可达 */
.cost-tip {
  min-width: 220px;
  max-width: 360px;
  font-size: var(--ds-font-small);
  line-height: 1.6;
}
.cost-tip-title {
  font-weight: 600;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--card);
}
.cost-tip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.cost-tip-row b { flex-shrink: 0; }
.cost-tip-disabled { opacity: 0.5; }
.cost-tip-empty { opacity: 0.7; }
</style>
