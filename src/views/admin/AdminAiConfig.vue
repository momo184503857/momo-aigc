<script setup lang="ts">
/**
 * AdminAiConfig - 管理后台「配置」页：AI 服务商 / 模型 / Key 管理。
 *
 * 关系：服务商 1─N 模型、服务商 1─N Key（唯一主 Key，连接调用一律走主 Key）。
 * 模型能力：识图（图片输入）/ 生图（图片输出，生图模型必定支持识图）。
 * 实际调用由后端 providers/ 适配器层完成，本页仅做配置与调试。
 */
defineOptions({ name: 'AdminAiConfig' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import PageLayout from '@/components/PageLayout.vue'
import {
  aiConfigApi,
  type ProviderRow,
  type ModelRow,
  type ProviderKeyRow,
  type AdapterInfo,
} from '@/services/aiConfigApi'
import { Plus, Refresh, Edit, Delete, Key, Connection, Picture, UploadFilled, ChatDotRound } from '@element-plus/icons-vue'

const { success, warning, error, confirmDanger } = useUiFeedback()

// ── 服务商列表 ──
const providers = ref<ProviderRow[]>([])
const adapters = ref<AdapterInfo[]>([])
const loading = ref(false)
const selectedId = ref<number | null>(null)
const selected = computed(() => providers.value.find((p) => p.id === selectedId.value) ?? null)
const activeTab = ref('models')

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

// ── 模型弹窗 ──
const modelDialog = ref(false)
const modelEditing = ref<ModelRow | null>(null)
const modelForm = ref({ model_id: '', display_name: '', supports_vision: false, supports_image_gen: false, remark: '' })
const modelSubmitting = ref(false)

function openModelCreate() {
  if (!selected.value) return
  modelEditing.value = null
  modelForm.value = { model_id: '', display_name: '', supports_vision: false, supports_image_gen: false, remark: '' }
  modelDialog.value = true
}

function openModelEdit(row: ModelRow) {
  modelEditing.value = row
  modelForm.value = {
    model_id: row.model_id,
    display_name: row.display_name,
    supports_vision: row.supports_vision,
    supports_image_gen: row.supports_image_gen,
    remark: row.remark,
  }
  modelDialog.value = true
}

/** 勾选「支持生图」时自动勾选并锁定「支持识图」（生图模型必定支持识图） */
function onGenChange(v: any) {
  modelForm.value.supports_image_gen = !!v
  if (v) modelForm.value.supports_vision = true
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
  modelSubmitting.value = true
  try {
    if (modelEditing.value) {
      await aiConfigApi.updateModel(modelEditing.value.id, {
        model_id: f.model_id.trim(), display_name: f.display_name.trim(),
        supports_vision: f.supports_vision, supports_image_gen: f.supports_image_gen, remark: f.remark,
      })
      success('模型已更新')
    } else {
      await aiConfigApi.createModel({
        provider_id: selected.value!.id, model_id: f.model_id.trim(), display_name: f.display_name.trim(),
        supports_vision: f.supports_vision, supports_image_gen: f.supports_image_gen, remark: f.remark,
      })
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
const keyForm = ref({ name: '', key: '', is_primary: true })
const keySubmitting = ref(false)

function openKeyCreate() {
  if (!selected.value) return
  keyEditing.value = null
  // 已有主 Key 时，新增 Key 默认不抢主 Key
  keyForm.value = { name: '', key: '', is_primary: !selected.value.keys.some((k) => k.is_primary) }
  keyDialog.value = true
}

function openKeyEdit(row: ProviderKeyRow) {
  keyEditing.value = row
  keyForm.value = { name: row.name, key: '', is_primary: row.is_primary }
  keyDialog.value = true
}

async function submitKey() {
  const f = keyForm.value
  if (keyEditing.value) {
    if (!f.name.trim()) { warning('请填写 Key 名称'); return }
    const payload: { name: string; key?: string; is_primary?: boolean } = { name: f.name.trim() }
    if (f.key.trim()) payload.key = f.key.trim()
    if (!keyEditing.value.is_primary) payload.is_primary = f.is_primary
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
      provider_id: selected.value!.id, name: f.name.trim(), key: f.key.trim(), is_primary: f.is_primary,
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

async function setPrimaryKey(row: ProviderKeyRow) {
  try {
    await aiConfigApi.updateKey(row.id, { is_primary: true })
    success(`已把「${row.name}」设为主 Key`)
    await loadAll()
  } catch (e) {
    error(e, '设置失败')
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

async function deleteKey(row: ProviderKeyRow) {
  try {
    await confirmDanger({ message: `确定删除 Key「${row.name}」吗？${row.is_primary ? '该 Key 是主 Key，删除后将自动提升其他 Key 为主 Key。' : ''}` })
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

onMounted(() => {
  loadAll()
  loadAdapters()
  loadDefaultVision()
})
</script>

<template>
  <PageLayout>
    <template #header><h2>配置</h2></template>

    <div class="toolbar">
      <div class="hint">管理 AI 服务商、模型与 API Key。每个服务商唯一一把主 Key，所有调用通过主 Key 连接。</div>
      <div class="toolbar-actions">
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
            <span>{{ p.models.length }} 模型 / {{ p.keys.length }} Key</span>
            <span class="primary-hint" :class="{ missing: !p.primary_key_hint }">
              {{ p.primary_key_hint ? `主Key ${p.primary_key_hint}` : '未设主Key' }}
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

        <el-tabs v-model="activeTab">
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

          <!-- Tab 2：Key 管理 -->
          <el-tab-pane :label="`Key 管理`" name="keys">
            <div class="tab-toolbar">
              <span class="tab-hint">Key 加密存储、仅脱敏展示；主 Key 唯一，连接调用一律使用主 Key。</span>
              <el-button type="primary" size="small" :icon="Key" @click="openKeyCreate">新增 Key</el-button>
            </div>
            <el-table :data="selected.keys" size="default" empty-text="暂无 Key">
              <el-table-column prop="name" label="名称" min-width="130" show-overflow-tooltip />
              <el-table-column label="Key" min-width="160">
                <template #default="{ row }">
                  <code class="key-hint">{{ row.key_hint || '—' }}</code>
                </template>
              </el-table-column>
              <el-table-column label="主 Key" width="110" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.is_primary" size="small" type="primary" effect="dark">主 Key</el-tag>
                  <el-button v-else link type="primary" @click="setPrimaryKey(row)">设为主 Key</el-button>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="90" align="center">
                <template #default="{ row }">
                  <el-switch
                    :model-value="row.status === 'active'"
                    :disabled="row.is_primary"
                    @change="(v: any) => toggleKeyStatus(row, v)"
                  />
                </template>
              </el-table-column>
              <el-table-column label="最近检测" min-width="150">
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
              <el-table-column label="操作" width="180" align="center">
                <template #default="{ row }">
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
                    >调用（走主 Key）</el-button>
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

    <!-- 模型弹窗 -->
    <el-dialog
      v-model="modelDialog"
      :title="modelEditing ? '编辑模型' : '新增模型'"
      width="540px" destroy-on-close
    >
      <el-form label-width="110px">
        <el-form-item label="模型 ID" required>
          <el-input v-model="modelForm.model_id" placeholder="调用 API 时使用的模型名，如 doubao-seed-2.1-turbo" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="modelForm.display_name" placeholder="选填，如 Doubao Seed 2.1 Turbo" />
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
          <el-input v-model="keyForm.name" placeholder="如：生产主 Key" maxlength="100" />
        </el-form-item>
        <el-form-item :label="keyEditing ? '新 Key' : 'API Key'" :required="!keyEditing">
          <el-input
            v-model="keyForm.key" type="password" show-password
            :placeholder="keyEditing ? '留空表示不修改 Key 内容' : 'ark-... / sk-...'"
          />
        </el-form-item>
        <el-form-item v-if="!keyEditing" label="设为主 Key">
          <el-checkbox v-model="keyForm.is_primary">作为该服务商的连接主 Key</el-checkbox>
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

.cap-no { color: var(--el-text-color-placeholder); }
.cap-hint { font-size: var(--momo-font-size-xs); color: var(--el-text-color-secondary); }
.key-hint { font-family: monospace; font-size: var(--momo-font-size-sm); }

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
