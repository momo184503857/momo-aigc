<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { formatCredits } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { ModelCapabilities } from '@/stores/modelCatalog'
import http from '@/services/http'
import {
  Plus, Connection, Refresh, Key, Delete, Edit, Setting, Coin,
} from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'MyChannels' })

/**
 * 我的渠道（ai-provider FR5）：用户自建渠道 + 渠道下自加模型。
 *  - 渠道 = 协议模板 + base_url + 主 Key（AES 加密存储、脱敏回显）+ 启停 + 测试连通；
 *  - toapis 协议渠道支持余额查询（S3，沿用余额轮询交互）；
 *  - 渠道模型：引用逻辑模型模板（可裁剪）或完全自定义能力；不扣积分、仅本人可见。
 */

const { success, warning, error, confirmDanger } = useUiFeedback()
const modelCatalog = useModelCatalogStore()

// ── 类型 ──

interface MyChannel {
  id: number
  code: string
  name: string
  baseUrl: string
  adapter: string
  adapterLabel: string
  status: string
  remark: string
  balanceCheckIntervalSec: number
  modelCount: number
  keyHint: string
  keyStatus: string | null
  lastCheckedAt: string | null
  lastCheckOk: boolean | null
  supportsBalance: boolean
  createdAt: string
}

interface AdapterOption { code: string; label: string; description: string; imageCapable: boolean; supportsBalance: boolean }
interface LogicalOption { id: number; code: string; name: string; defaultParams: ModelCapabilities | null }

interface MyChannelModel {
  id: number
  modelId: string
  displayName: string
  logicalModelId: number | null
  logicalCode: string | null
  paramOverrides: Partial<ModelCapabilities> | null
  capabilities: ModelCapabilities | null
  supportsImageGen: boolean
  supportsChat: boolean
  status: string
}

// ── 渠道列表 ──

const channels = ref<MyChannel[]>([])
const loading = ref(false)
const adapters = ref<AdapterOption[]>([])
const logicalModels = ref<LogicalOption[]>([])

const myChannelsApi = {
  list: () => http.get('/my/channels'),
  create: (d: any) => http.post('/my/channels', d),
  update: (id: number, d: any) => http.patch(`/my/channels/${id}`, d),
  remove: (id: number) => http.delete(`/my/channels/${id}`),
  putKey: (id: number, key: string) => http.put(`/my/channels/${id}/key`, { key }),
  test: (id: number) => http.post(`/my/channels/${id}/test`),
  balance: (id: number) => http.get(`/my/channels/${id}/balance`),
  models: (id: number) => http.get(`/my/channels/${id}/models`),
  createModel: (id: number, d: any) => http.post(`/my/channels/${id}/models`, d),
  updateModel: (id: number, modelId: number, d: any) => http.patch(`/my/channels/${id}/models/${modelId}`, d),
  removeModel: (id: number, modelId: number) => http.delete(`/my/channels/${id}/models/${modelId}`),
  meta: () => http.get('/my/meta'),
}

async function loadChannels() {
  loading.value = true
  try {
    const res = await myChannelsApi.list()
    channels.value = res.data.data || []
  } catch (e: any) {
    error('加载渠道失败：' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
}

async function loadMeta() {
  try {
    const res = await myChannelsApi.meta()
    adapters.value = res.data.data.adapters || []
    logicalModels.value = res.data.data.logicalModels || []
  } catch { /* ignore */ }
}

function adapterLabelOf(code: string): string {
  return adapters.value.find((a) => a.code === code)?.label ?? code
}

// ── 渠道新建/编辑弹窗 ──

const channelDialog = ref(false)
const editingChannel = ref<MyChannel | null>(null)
const channelForm = ref({ name: '', adapter: 'toapis', baseUrl: '', key: '', remark: '' })
const channelSaving = ref(false)
const channelTesting = ref(false)
const channelTestResult = ref<{ ok: boolean; message: string } | null>(null)

function openCreateChannel() {
  editingChannel.value = null
  channelForm.value = { name: '', adapter: 'toapis', baseUrl: '', key: '', remark: '' }
  channelTestResult.value = null
  channelDialog.value = true
}

function openEditChannel(ch: MyChannel) {
  editingChannel.value = ch
  channelForm.value = { name: ch.name, adapter: ch.adapter, baseUrl: ch.baseUrl, key: '', remark: ch.remark }
  channelTestResult.value = null
  channelDialog.value = true
}

async function saveChannel() {
  const f = channelForm.value
  if (!f.name.trim()) { warning('请输入渠道名称'); return }
  if (!f.baseUrl.trim()) { warning('请输入 Base URL'); return }
  channelSaving.value = true
  try {
    if (editingChannel.value) {
      const patch: Record<string, unknown> = {
        name: f.name.trim(), baseUrl: f.baseUrl.trim(), adapter: f.adapter, remark: f.remark,
      }
      await myChannelsApi.update(editingChannel.value.id, patch)
      if (f.key.trim()) {
        await myChannelsApi.putKey(editingChannel.value.id, f.key.trim())
      }
      success('渠道已更新')
    } else {
      if (!f.key.trim()) { warning('请输入 API Key'); channelSaving.value = false; return }
      await myChannelsApi.create({
        name: f.name.trim(), adapter: f.adapter, baseUrl: f.baseUrl.trim(), key: f.key.trim(), remark: f.remark,
      })
      success('渠道已创建')
    }
    channelDialog.value = false
    await loadChannels()
    await modelCatalog.refresh()
  } catch (e: any) {
    error('保存失败：' + (e.response?.data?.error || e.message))
  } finally {
    channelSaving.value = false
  }
}

async function testChannel() {
  const f = channelForm.value
  if (editingChannel.value) {
    // 已有渠道：用库里的主 Key 测（先落保存的 baseUrl 不必）
    channelTesting.value = true
    try {
      const res = await myChannelsApi.test(editingChannel.value.id)
      channelTestResult.value = res.data.data
    } catch (e: any) {
      channelTestResult.value = { ok: false, message: e.response?.data?.error || e.message }
    } finally {
      channelTesting.value = false
    }
    return
  }
  if (!f.baseUrl.trim() || !f.key.trim()) { warning('请先填写 Base URL 和 API Key'); return }
  channelTesting.value = true
  channelTestResult.value = null
  try {
    // 未落库的草稿：先创建为停用？——为避免脏数据，直接创建后测试，失败可删。
    const created = await myChannelsApi.create({
      name: f.name.trim() || '测试渠道', adapter: f.adapter, baseUrl: f.baseUrl.trim(), key: f.key.trim(), remark: f.remark,
    })
    const ch: MyChannel = created.data.data
    const res = await myChannelsApi.test(ch.id)
    channelTestResult.value = res.data.data
    if (!res.data.data.ok) {
      await myChannelsApi.remove(ch.id).catch(() => {})
      warning('连通测试失败，渠道未保存')
    } else {
      await loadChannels()
      await modelCatalog.refresh()
      editingChannel.value = ch
      success('连通成功，渠道已保存')
      channelDialog.value = false
    }
  } catch (e: any) {
    error('测试失败：' + (e.response?.data?.error || e.message))
  } finally {
    channelTesting.value = false
  }
}

async function toggleChannelStatus(ch: MyChannel) {
  const next = ch.status === 'active' ? 'disabled' : 'active'
  try {
    await myChannelsApi.update(ch.id, { status: next })
    ch.status = next
    await modelCatalog.refresh()
    success(next === 'active' ? '渠道已启用' : '渠道已停用（其模型从生图表单消失）')
  } catch (e: any) {
    error('操作失败：' + (e.response?.data?.error || e.message))
  }
}

async function deleteChannel(ch: MyChannel) {
  try {
    await confirmDanger({
      title: '删除渠道',
      message: `确定删除渠道「${ch.name}」吗？其下 ${ch.modelCount} 个模型将一并删除（历史任务快照保留）。`,
      confirmText: '删除', cancelText: '取消',
    })
  } catch { return }
  try {
    await myChannelsApi.remove(ch.id)
    success('渠道已删除')
    await loadChannels()
    await modelCatalog.refresh()
  } catch (e: any) {
    error('删除失败：' + (e.response?.data?.error || e.message))
  }
}

async function testExistingChannel(ch: MyChannel) {
  try {
    const res = await myChannelsApi.test(ch.id)
    const d = res.data.data
    if (d.ok) success(`${ch.name}：${d.message}`)
    else warning(`${ch.name}：${d.message}`)
    await loadChannels()
  } catch (e: any) {
    warning('测试失败：' + (e.response?.data?.error || e.message))
  }
}

// ── Key 轮换弹窗 ──

const keyDialog = ref(false)
const keyTarget = ref<MyChannel | null>(null)
const keyValue = ref('')
const keySaving = ref(false)

function openKeyDialog(ch: MyChannel) {
  keyTarget.value = ch
  keyValue.value = ''
  keyDialog.value = true
}

async function saveKey() {
  if (!keyTarget.value) return
  if (!keyValue.value.trim()) { warning('请输入新的 API Key'); return }
  keySaving.value = true
  try {
    await myChannelsApi.putKey(keyTarget.value.id, keyValue.value.trim())
    success('Key 已更新')
    keyDialog.value = false
    await loadChannels()
  } catch (e: any) {
    error('更新失败：' + (e.response?.data?.error || e.message))
  } finally {
    keySaving.value = false
  }
}

// ── 余额（仅 toapis 协议，S3）──

const balanceMap = ref<Record<number, { balance: number; credits: number } | 'error'>>({})
const balanceLoading = ref<Record<number, boolean>>({})
let balanceTimer: ReturnType<typeof setInterval> | null = null

async function refreshBalance(ch: MyChannel, silent = false) {
  if (!ch.supportsBalance) return
  balanceLoading.value = { ...balanceLoading.value, [ch.id]: true }
  try {
    const res = await myChannelsApi.balance(ch.id)
    balanceMap.value = { ...balanceMap.value, [ch.id]: res.data.data }
  } catch (e: any) {
    balanceMap.value = { ...balanceMap.value, [ch.id]: 'error' }
    if (!silent) warning('余额查询失败：' + (e.response?.data?.error || e.message))
  } finally {
    balanceLoading.value = { ...balanceLoading.value, [ch.id]: false }
  }
}

function refreshAllBalances(silent = true) {
  channels.value.filter((c) => c.supportsBalance && c.status === 'active').forEach((c) => refreshBalance(c, silent))
}

function startBalancePolling() {
  stopBalancePolling()
  refreshAllBalances(true)
  balanceTimer = setInterval(() => refreshAllBalances(true), 60_000)
}

function stopBalancePolling() {
  if (balanceTimer) {
    clearInterval(balanceTimer)
    balanceTimer = null
  }
}

function channelInterval(ch: MyChannel): number {
  return ch.balanceCheckIntervalSec ?? 60
}

// ── 渠道模型管理 ──

const expandedId = ref<number | null>(null)
const modelsMap = ref<Record<number, MyChannelModel[]>>({})
const modelsLoading = ref<Record<number, boolean>>({})

async function toggleExpand(ch: MyChannel) {
  if (expandedId.value === ch.id) {
    expandedId.value = null
    return
  }
  expandedId.value = ch.id
  await loadModels(ch)
}

async function loadModels(ch: MyChannel) {
  modelsLoading.value = { ...modelsLoading.value, [ch.id]: true }
  try {
    const res = await myChannelsApi.models(ch.id)
    modelsMap.value = { ...modelsMap.value, [ch.id]: res.data.data || [] }
  } catch (e: any) {
    error('加载模型失败：' + (e.response?.data?.error || e.message))
  } finally {
    modelsLoading.value = { ...modelsLoading.value, [ch.id]: false }
  }
}

// 模型弹窗
const modelDialog = ref(false)
const modelChannel = ref<MyChannel | null>(null)
const editingModel = ref<MyChannelModel | null>(null)
const modelForm = ref({
  modelId: '',
  displayName: '',
  capabilitySource: 'logical' as 'logical' | 'custom',
  logicalModelId: null as number | null,
  // 裁剪（引用逻辑模型时）：选中的分辨率/宽高比
  selectedResolutions: [] as string[],
  selectedRatios: [] as string[],
  // 完全自定义
  customResolutions: '1K, 2K',
  customRatios: '1:1, 3:4, 9:16',
  customMaxRef: 14,
  customMaxPromptChars: 32000,
  supportsChat: false,
})
const modelSaving = ref(false)

const allRatioOptions = ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '2:3', '3:2', '21:9', '1:4', '4:1', '1:8', '8:1']
const resolutionOptions = ['512', '1K', '2K', '4K']

function openCreateModel(ch: MyChannel) {
  modelChannel.value = ch
  editingModel.value = null
  modelForm.value = {
    modelId: '', displayName: '', capabilitySource: 'logical',
    logicalModelId: logicalModels.value[0]?.id ?? null,
    selectedResolutions: [], selectedRatios: [],
    customResolutions: '1K, 2K', customRatios: '1:1, 3:4, 9:16',
    customMaxRef: 14, customMaxPromptChars: 32000, supportsChat: false,
  }
  modelDialog.value = true
}

function openEditModel(ch: MyChannel, m: MyChannelModel) {
  modelChannel.value = ch
  editingModel.value = m
  const overrides = m.paramOverrides || {}
  modelForm.value = {
    modelId: m.modelId,
    displayName: m.displayName,
    capabilitySource: m.logicalModelId ? 'logical' : 'custom',
    logicalModelId: m.logicalModelId,
    selectedResolutions: overrides.resolutions ?? [],
    selectedRatios: overrides.aspectRatios ?? [],
    customResolutions: (overrides.resolutions ?? m.capabilities?.resolutions ?? []).join(', '),
    customRatios: (overrides.aspectRatios ?? m.capabilities?.aspectRatios ?? []).join(', '),
    customMaxRef: overrides.maxReferenceImages ?? m.capabilities?.maxReferenceImages ?? 14,
    customMaxPromptChars: overrides.maxPromptChars ?? m.capabilities?.maxPromptChars ?? 32000,
    supportsChat: m.supportsChat,
  }
  modelDialog.value = true
}

function parseList(s: string): string[] {
  return s.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
}

const selectedLogical = computed(() => logicalModels.value.find((l) => l.id === modelForm.value.logicalModelId))

function buildModelPayload(): Record<string, unknown> {
  const f = modelForm.value
  const payload: Record<string, unknown> = {
    model_id: f.modelId.trim(),
    display_name: f.displayName.trim(),
    supports_chat: f.supportsChat,
    supports_image_gen: true,
  }
  if (f.capabilitySource === 'logical') {
    payload.logical_model_id = f.logicalModelId
    const overrides: Record<string, unknown> = {}
    if (f.selectedResolutions.length > 0) overrides.resolutions = f.selectedResolutions
    if (f.selectedRatios.length > 0) overrides.aspectRatios = f.selectedRatios
    payload.param_overrides = Object.keys(overrides).length > 0 ? overrides : null
  } else {
    payload.logical_model_id = null
    const resolutions = parseList(f.customResolutions)
    const ratios = parseList(f.customRatios)
    payload.param_overrides = {
      resolutions,
      aspectRatios: ratios,
      maxReferenceImages: f.customMaxRef,
      maxPromptChars: f.customMaxPromptChars,
    }
  }
  return payload
}

async function saveModel() {
  if (!modelChannel.value) return
  const f = modelForm.value
  if (!f.modelId.trim()) { warning('请输入渠道模型名（发给上游的 model 字符串）'); return }
  if (f.capabilitySource === 'logical' && !f.logicalModelId) { warning('请选择逻辑模型模板'); return }
  if (f.capabilitySource === 'custom') {
    if (parseList(f.customResolutions).length === 0) { warning('请至少配置一个分辨率'); return }
    if (parseList(f.customRatios).length === 0) { warning('请至少配置一个宽高比'); return }
  }
  modelSaving.value = true
  try {
    if (editingModel.value) {
      await myChannelsApi.updateModel(modelChannel.value.id, editingModel.value.id, buildModelPayload())
      success('模型已更新')
    } else {
      await myChannelsApi.createModel(modelChannel.value.id, buildModelPayload())
      success('模型已添加，生图表单「我的渠道」分组立即可见')
    }
    modelDialog.value = false
    await loadModels(modelChannel.value)
    await loadChannels()
    await modelCatalog.refresh()
  } catch (e: any) {
    error('保存失败：' + (e.response?.data?.error || e.message))
  } finally {
    modelSaving.value = false
  }
}

async function toggleModelStatus(ch: MyChannel, m: MyChannelModel) {
  const next = m.status === 'active' ? 'disabled' : 'active'
  try {
    await myChannelsApi.updateModel(ch.id, m.id, { status: next })
    m.status = next
    await modelCatalog.refresh()
  } catch (e: any) {
    error('操作失败：' + (e.response?.data?.error || e.message))
  }
}

async function deleteModel(ch: MyChannel, m: MyChannelModel) {
  try {
    await confirmDanger({
      title: '删除模型',
      message: `确定删除模型「${m.displayName || m.modelId}」吗？历史任务快照保留，不受影响。`,
      confirmText: '删除', cancelText: '取消',
    })
  } catch { return }
  try {
    await myChannelsApi.removeModel(ch.id, m.id)
    success('模型已删除')
    await loadModels(ch)
    await loadChannels()
    await modelCatalog.refresh()
  } catch (e: any) {
    error('删除失败：' + (e.response?.data?.error || e.message))
  }
}

function capabilitySummary(m: MyChannelModel): string {
  const caps = m.capabilities
  if (!caps) return m.supportsChat ? '文字模型' : '未配置能力'
  const parts: string[] = []
  if (m.supportsImageGen) parts.push(caps.resolutions.join('/'))
  if (m.supportsChat) parts.push('文字')
  return parts.join(' · ') || '-'
}

// ── 生命周期 ──

onMounted(async () => {
  await Promise.all([loadChannels(), loadMeta()])
  startBalancePolling()
})

onUnmounted(() => {
  stopBalancePolling()
})
</script>

<template>
  <PageLayout>
    <template #header>
      <div class="page-header-row">
        <h2>我的渠道</h2>
        <el-button type="primary" :icon="Plus" @click="openCreateChannel">新建渠道</el-button>
      </div>
    </template>

    <el-alert
      class="intro"
      type="info" :closable="false" show-icon
      title="自建渠道仅本人可见，其下模型在生图表单「我的渠道」分组中选择，生图不扣积分（费用由你与上游渠道直接结算）。所有请求经平台服务器代理发出，Key 加密存储。"
    />

    <div v-loading="loading">
      <el-empty v-if="channels.length === 0 && !loading" description="还没有自建渠道，点击右上角「新建渠道」开始" />

      <div v-for="ch in channels" :key="ch.id" class="channel-card" :class="{ disabled: ch.status !== 'active' }">
        <div class="ch-head" @click="toggleExpand(ch)">
          <div class="ch-title">
            <el-icon size="18" class="ch-icon"><Connection /></el-icon>
            <span class="ch-name">{{ ch.name }}</span>
            <el-tag size="small" type="info">{{ ch.adapterLabel }}</el-tag>
            <el-tag size="small" :type="ch.status === 'active' ? 'success' : 'danger'">
              {{ ch.status === 'active' ? '启用' : '停用' }}
            </el-tag>
            <el-tag v-if="ch.supportsBalance" size="small" type="warning" effect="plain">支持余额查询</el-tag>
          </div>
          <div class="ch-meta">
            <span class="ch-url">{{ ch.baseUrl }}</span>
            <span class="ch-key">Key {{ ch.keyHint || '未配置' }}</span>
            <span class="ch-models">{{ ch.modelCount }} 个模型</span>
          </div>
        </div>

        <div class="ch-body">
          <!-- 余额区（仅 toapis 协议） -->
          <div v-if="ch.supportsBalance" class="ch-balance">
            <el-icon size="16"><Coin /></el-icon>
            <span class="cb-label">渠道余额</span>
            <span v-if="balanceMap[ch.id] && balanceMap[ch.id] !== 'error'" class="cb-value">
              {{ formatCredits((balanceMap[ch.id] as any).credits, { creditDigits: 2, yuanDigits: 2 }) }}
            </span>
            <span v-else-if="balanceMap[ch.id] === 'error'" class="cb-value cb-error">查询失败</span>
            <span v-else class="cb-value cb-pending">—</span>
            <el-button
              size="small" text type="primary" :icon="Refresh"
              :loading="balanceLoading[ch.id]"
              @click="refreshBalance(ch)"
            >刷新</el-button>
            <span class="cb-interval">每 {{ channelInterval(ch) >= 60 ? Math.round(channelInterval(ch) / 60) + ' 分钟' : channelInterval(ch) + ' 秒' }}自动刷新</span>
          </div>

          <div class="ch-actions">
            <el-button size="small" :icon="Setting" @click="toggleExpand(ch)">
              {{ expandedId === ch.id ? '收起模型' : '管理模型' }}
            </el-button>
            <el-button size="small" :icon="Connection" @click="testExistingChannel(ch)">测试连通</el-button>
            <el-button size="small" :icon="Key" @click="openKeyDialog(ch)">轮换 Key</el-button>
            <el-button size="small" :icon="Edit" @click="openEditChannel(ch)">编辑</el-button>
            <el-button size="small" :type="ch.status === 'active' ? 'warning' : 'success'" plain @click="toggleChannelStatus(ch)">
              {{ ch.status === 'active' ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" type="danger" :icon="Delete" plain @click="deleteChannel(ch)">删除</el-button>
          </div>
        </div>

        <!-- 模型列表 -->
        <div v-if="expandedId === ch.id" class="ch-models" v-loading="modelsLoading[ch.id]">
          <div class="cm-toolbar">
            <span class="cm-title">渠道模型（{{ (modelsMap[ch.id] || []).length }}）</span>
            <el-button size="small" type="primary" :icon="Plus" @click="openCreateModel(ch)">添加模型</el-button>
          </div>
          <el-table :data="modelsMap[ch.id] || []" size="small" border>
            <el-table-column label="渠道模型名" prop="modelId" min-width="180" show-overflow-tooltip />
            <el-table-column label="显示名" min-width="140">
              <template #default="{ row }">{{ row.displayName || row.logicalCode || row.modelId }}</template>
            </el-table-column>
            <el-table-column label="能力来源" width="120">
              <template #default="{ row }">
                <el-tag v-if="row.logicalCode" size="small" type="info">{{ row.logicalCode }}</el-tag>
                <el-tag v-else size="small" type="warning">自定义</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="生效能力" min-width="180">
              <template #default="{ row }">{{ capabilitySummary(row) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'active' ? 'success' : 'danger'">
                  {{ row.status === 'active' ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="openEditModel(ch, row)">编辑</el-button>
                <el-button size="small" text :type="row.status === 'active' ? 'warning' : 'success'" @click="toggleModelStatus(ch, row)">
                  {{ row.status === 'active' ? '停用' : '启用' }}
                </el-button>
                <el-button size="small" text type="danger" @click="deleteModel(ch, row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>

    <!-- 渠道新建/编辑弹窗 -->
    <el-dialog
      v-model="channelDialog"
      :title="editingChannel ? '编辑渠道' : '新建渠道'"
      width="560px" align-center :close-on-click-modal="false"
    >
      <el-form label-width="90px">
        <el-form-item label="渠道名称">
          <el-input v-model="channelForm.name" placeholder="如：我的中转站" maxlength="50" />
        </el-form-item>
        <el-form-item label="协议模板">
          <el-select v-model="channelForm.adapter" style="width: 100%" :disabled="!!editingChannel">
            <el-option v-for="a in adapters" :key="a.code" :value="a.code" :label="a.label">
              <div class="adapter-option">
                <span>{{ a.label }}</span>
                <span class="adapter-desc">{{ a.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="channelForm.baseUrl" placeholder="https://api.example.com（仅 http/https，禁止内网地址）" />
        </el-form-item>
        <el-form-item :label="editingChannel ? '新 Key' : 'API Key'">
          <el-input
            v-model="channelForm.key"
            type="password" show-password
            :placeholder="editingChannel ? '留空表示不修改' : '输入渠道主 Key（加密存储）'"
          />
          <div v-if="editingChannel?.keyHint" class="field-hint">当前 Key：{{ editingChannel.keyHint }}</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="channelForm.remark" placeholder="可选" />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="channelTestResult"
        class="test-result"
        :type="channelTestResult.ok ? 'success' : 'error'" :closable="false" show-icon
        :title="channelTestResult.message"
      />

      <template #footer>
        <div class="dialog-footer-row">
          <div>
            <el-button :icon="Connection" :loading="channelTesting" @click="testChannel">测试连通</el-button>
          </div>
          <div>
            <el-button @click="channelDialog = false">取消</el-button>
            <el-button type="primary" :loading="channelSaving" @click="saveChannel">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- Key 轮换弹窗 -->
    <el-dialog v-model="keyDialog" title="轮换 Key" width="460px" align-center>
      <p class="dialog-text">渠道：{{ keyTarget?.name }}（当前 {{ keyTarget?.keyHint || '未配置' }}）</p>
      <el-input v-model="keyValue" type="password" show-password placeholder="输入新的 API Key" />
      <template #footer>
        <el-button @click="keyDialog = false">取消</el-button>
        <el-button type="primary" :loading="keySaving" @click="saveKey">保存</el-button>
      </template>
    </el-dialog>

    <!-- 模型弹窗 -->
    <el-dialog
      v-model="modelDialog"
      :title="editingModel ? '编辑渠道模型' : '添加渠道模型'"
      width="640px" align-center :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="渠道模型名">
          <el-input v-model="modelForm.modelId" placeholder="发给上游的 model 字符串，如 gpt-4o-image" />
          <div class="field-hint">同一逻辑模型在不同渠道的叫法可能不同，这里填你渠道的实际模型名</div>
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="modelForm.displayName" placeholder="可选，默认取逻辑模型名" />
        </el-form-item>
        <el-form-item label="能力来源">
          <el-radio-group v-model="modelForm.capabilitySource" :disabled="!!editingModel">
            <el-radio-button value="logical">引用逻辑模型模板</el-radio-button>
            <el-radio-button value="custom">完全自定义</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="modelForm.capabilitySource === 'logical'">
          <el-form-item label="逻辑模型">
            <el-select v-model="modelForm.logicalModelId" style="width: 100%">
              <el-option v-for="lm in logicalModels" :key="lm.id" :value="lm.id" :label="`${lm.name}（${lm.code}）`" />
            </el-select>
            <div v-if="selectedLogical?.defaultParams" class="field-hint">
              模板能力：{{ selectedLogical.defaultParams.resolutions.join(' / ') }}，最多 {{ selectedLogical.defaultParams.maxReferenceImages }} 张参考图
            </div>
          </el-form-item>
          <el-form-item label="裁剪分辨率">
            <el-checkbox-group v-model="modelForm.selectedResolutions">
              <el-checkbox v-for="r in (selectedLogical?.defaultParams?.resolutions || [])" :key="r" :value="r">{{ r }}</el-checkbox>
            </el-checkbox-group>
            <div class="field-hint">不勾选 = 全部继承</div>
          </el-form-item>
          <el-form-item label="裁剪宽高比">
            <el-select v-model="modelForm.selectedRatios" multiple collapse-tags collapse-tags-tooltip style="width: 100%" placeholder="不选 = 全部继承">
              <el-option v-for="r in allRatioOptions" :key="r" :value="r" :label="r" />
            </el-select>
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="分辨率">
            <el-select v-model="modelForm.customResolutions" multiple filterable allow-create style="width: 100%" placeholder="如 1K、2K">
              <el-option v-for="r in resolutionOptions" :key="r" :value="r" :label="r" />
            </el-select>
          </el-form-item>
          <el-form-item label="宽高比">
            <el-select v-model="modelForm.customRatios" multiple filterable allow-create style="width: 100%" placeholder="如 1:1、3:4">
              <el-option v-for="r in allRatioOptions" :key="r" :value="r" :label="r" />
            </el-select>
          </el-form-item>
          <el-form-item label="参考图上限">
            <el-input-number v-model="modelForm.customMaxRef" :min="0" :max="20" />
          </el-form-item>
          <el-form-item label="提示词上限">
            <el-input-number v-model="modelForm.customMaxPromptChars" :min="100" :max="32000" :step="100" />
          </el-form-item>
        </template>

        <el-form-item label="文字模型">
          <el-switch v-model="modelForm.supportsChat" active-text="支持文字（画布文字 AI 节点可用）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modelDialog = false">取消</el-button>
        <el-button type="primary" :loading="modelSaving" @click="saveModel">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.page-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.intro {
  margin-bottom: 16px;
}

.channel-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  margin-bottom: 16px;
  overflow: hidden;
}
.channel-card.disabled {
  opacity: 0.72;
}
.ch-head {
  padding: 16px 20px;
  cursor: pointer;
}
.ch-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ch-icon {
  color: var(--el-color-primary);
}
.ch-name {
  font-size: var(--momo-font-size-lg, 16px);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ch-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}
.ch-url {
  font-family: monospace;
}
.ch-key {
  font-family: monospace;
}
.ch-body {
  padding: 0 20px 14px;
}
.ch-balance {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-color-warning-light-9);
  border-radius: var(--momo-radius-sm, 6px);
  margin-bottom: 10px;
  font-size: var(--momo-font-size-sm);
}
.cb-label { color: var(--el-text-color-secondary); }
.cb-value { font-weight: 600; color: var(--el-color-warning); }
.cb-pending { color: var(--el-text-color-placeholder); font-weight: 400; }
.cb-error { color: var(--el-color-danger); font-weight: 400; }
.cb-interval { margin-left: auto; color: var(--el-text-color-placeholder); font-size: var(--momo-font-size-xs); }
.ch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}
.ch-models {
  border-top: 1px dashed var(--el-border-color-lighter);
  padding: 14px 20px;
  background: var(--el-fill-color-extra-light);
}
.cm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.cm-title {
  font-weight: 600;
  font-size: var(--momo-font-size-base);
}

.test-result { margin-top: 12px; }
.dialog-footer-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
.dialog-text {
  margin: 0 0 12px 0;
  color: var(--el-text-color-secondary);
  font-size: var(--momo-font-size-sm);
}
.field-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  line-height: 1.5;
  margin-top: 4px;
}
.adapter-option {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}
.adapter-desc {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}
</style>
