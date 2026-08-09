<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { toBJMinute, toBJMinuteFromMs } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { pointsApi } from '@/services/pointsApi'
import { userKeyApi } from '@/services/userKeyApi'
import { useServerStatusStore } from '@/stores/serverStatus'
import { formatCredits } from '@/types/adapter'
import { Coin, Key, Refresh, Setting } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'MyQuota' })

const { success, warning, error } = useUiFeedback()
const serverStatus = useServerStatusStore()

interface QuotaData {
  platform: { credits: number; yuan: number }
  recentTransactions: Array<{
    id: number; amount: number; balance_after: number
    reason: string; note: string; created_at: string
  }>
}

const quota = ref<QuotaData | null>(null)
const loading = ref(false)

// 顶部模式开关（本地态，镜像 serverStatus.usingPersonalKey）
const selectedMode = ref<'platform' | 'personal'>('platform')
watch(
  () => serverStatus.usingPersonalKey,
  (v) => { selectedMode.value = v ? 'personal' : 'platform' },
  { immediate: true },
)

// 个人 Key 配置弹窗
const showKeyDialog = ref(false)
function openKeyDialog() {
  apiKey.value = ''
  showKeyDialog.value = true
}

const apiKey = ref('')
const hasPersonalKey = ref(false)
const keyHint = ref('')
const intervalSec = ref<number>(60)
const saving = ref(false)
const testing = ref(false)
const savingInterval = ref(false)
// 模式切换防重入标志（写库 + 拉取状态期间为 true）
const modeSwitching = ref(false)

const intervalQuickOptions = [
  { label: '1 分钟', value: 60 },
  { label: '30 分钟', value: 1800 },
  { label: '1 小时', value: 3600 },
  { label: '1 天', value: 86400 },
  { label: '不查询', value: 0 },
]

const reasonLabel: Record<string, string> = {
  generation: '生图扣费',
  admin_recharge: '管理员充值',
  admin_deduct: '管理员扣减',
  refund: '失败退款',
}

async function load() {
  loading.value = true
  try {
    const res = await pointsApi.getMyQuota()
    quota.value = res.data.data
  } catch (e: any) {
    error('加载额度失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
}

async function loadConfig() {
  try {
    const res = await userKeyApi.getKeyConfig()
    const d = res.data.data
    hasPersonalKey.value = d.hasPersonalKey
    keyHint.value = d.keyHint
    intervalSec.value = d.balanceCheckIntervalSec
  } catch {
    // 拉取失败时回退到 store 状态，避免 hasPersonalKey 卡在 false 导致模式切换走错分支
    hasPersonalKey.value = serverStatus.personalKeyConfigured
  }
}

async function handleSave() {
  if (!apiKey.value.trim()) {
    warning('请输入 API Key')
    return
  }
  saving.value = true
  try {
    const res = await userKeyApi.saveKey(apiKey.value.trim(), intervalSec.value)
    hasPersonalKey.value = true
    keyHint.value = res.data.data.keyHint
    intervalSec.value = res.data.data.balanceCheckIntervalSec
    apiKey.value = ''
    // 若用户已选择个人模式，则保存后一并激活
    if (selectedMode.value === 'personal') {
      await userKeyApi.setMode(true)
      await serverStatus.refreshKeyConfig()
      success('个人 Key 已保存并启用')
    } else {
      await serverStatus.refreshKeyConfig()
      success('个人 Key 已保存')
    }
    showKeyDialog.value = false
  } catch (e: any) {
    error('保存失败: ' + (e.response?.data?.error || e.message))
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  const key = apiKey.value.trim()
  if (!key) {
    warning('请先输入 API Key')
    return
  }
  testing.value = true
  try {
    const res = await userKeyApi.test(key)
    if (res.data.data.ok) {
      success('连接成功，API Key 有效')
    } else {
      error('连接失败，API Key 无效或网络异常')
    }
  } catch (e: any) {
    error('测试失败: ' + (e.response?.data?.error || e.message))
  } finally {
    testing.value = false
  }
}

async function handleDeleteKey() {
  try {
    await userKeyApi.deleteKey()
    hasPersonalKey.value = false
    keyHint.value = ''
    apiKey.value = ''
    showKeyDialog.value = false
    await serverStatus.refreshKeyConfig()
    success('个人 Key 已清空')
  } catch (e: any) {
    error('清空失败: ' + (e.response?.data?.error || e.message))
  }
}

async function onModeChange(val: string | number | boolean) {
  // 防重入：上一次切换尚未结束（写库/拉取状态中）时，忽略新的点击
  if (modeSwitching.value) {
    // 单向 model-value 下，忽略点击会导致 radio 不跟随，这里把选中态拨回当前真实模式
    selectedMode.value = serverStatus.usingPersonalKey ? 'personal' : 'platform'
    return
  }

  if (val === 'personal') {
    // 未配置个人 Key：本地切到 personal 仅展示输入区，不调用 setMode（保存前禁止生图）
    if (!hasPersonalKey.value) {
      selectedMode.value = 'personal'
      warning('请先点击「配置个人 Key」输入并保存')
      return
    }
    // 乐观更新：立即让 radio 选中个人 Key，避免网络往返期间看起来“点了没反应”
    selectedMode.value = 'personal'
    modeSwitching.value = true
    try {
      await userKeyApi.setMode(true)
      await serverStatus.refreshKeyConfig()
      success('已切换到个人 Key')
    } catch (e: any) {
      // 写库失败：回滚到平台模式
      selectedMode.value = 'platform'
      error('切换失败: ' + (e.response?.data?.error || e.message))
    } finally {
      modeSwitching.value = false
    }
  } else {
    // 切回平台积分
    showKeyDialog.value = false
    selectedMode.value = 'platform'
    modeSwitching.value = true
    try {
      await userKeyApi.setMode(false)
      await serverStatus.refreshKeyConfig()
      success('已切换到平台积分')
    } catch (e: any) {
      // 写库失败：回滚到切换前状态
      selectedMode.value = serverStatus.usingPersonalKey ? 'personal' : 'platform'
      error('切换失败: ' + (e.response?.data?.error || e.message))
    } finally {
      modeSwitching.value = false
    }
  }
}

async function handleIntervalChange(val: number | undefined) {
  const v = typeof val === 'number' ? val : 0
  intervalSec.value = v
  if (!hasPersonalKey.value) return // 未保存 Key 时，间隔随保存 Key 一并落库
  savingInterval.value = true
  try {
    await userKeyApi.setBalanceInterval(v)
    await serverStatus.refreshKeyConfig() // 同步 store 间隔 → 重置轮询
  } catch (e: any) {
    error('设置间隔失败: ' + (e.response?.data?.error || e.message))
  } finally {
    savingInterval.value = false
  }
}

function formatInterval(s: number): string {
  if (s <= 0) return '手动查询'
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.round(s / 60)} 分钟`
  if (s < 86400) return `${Math.round((s / 3600) * 10) / 10} 小时`
  return `${Math.round((s / 86400) * 10) / 10} 天`
}

function formatTime(ts: number | null): string {
  if (!ts) return ''
  return toBJMinuteFromMs(ts)
}

onMounted(() => {
  serverStatus.fetchStatus()
  // 先用 store 已加载的 personalKeyConfigured 兜底，避免 loadConfig 未返回时点击个人 Key 走错分支
  hasPersonalKey.value = serverStatus.personalKeyConfigured
  load()
  loadConfig()
})
</script>

<template>
  <PageLayout>
    <template #header><h2>我的额度</h2></template>

    <!-- 顶部：醒目的计费方式开关 -->
    <div class="mode-switch-card">
      <div class="ms-label">当前使用的计费方式</div>
      <el-radio-group
        :model-value="selectedMode"
        size="large"
        class="ms-group"
        @change="onModeChange"
      >
        <el-radio-button value="platform">
          <el-icon class="ms-icon"><Coin /></el-icon>
          <span>平台积分</span>
        </el-radio-button>
        <el-radio-button value="personal">
          <el-icon class="ms-icon"><Key /></el-icon>
          <span>个人 Key</span>
        </el-radio-button>
      </el-radio-group>
      <div class="ms-hint">
        <span v-if="selectedMode === 'personal'" class="ms-tag personal">● 个人 Key 生图，不消耗平台积分</span>
        <span v-else class="ms-tag platform">● 平台积分生图，按平台单价扣费</span>
      </div>
    </div>

    <!-- ─── 平台积分分支 ─── -->
    <div v-if="selectedMode === 'platform'" v-loading="loading">
      <div class="cards">
        <div class="quota-card primary">
          <div class="qc-header">
            <el-icon size="18" color="var(--el-color-warning)"><Coin /></el-icon>
            <span>平台积分余额</span>
          </div>
          <div v-if="quota" class="qc-value">{{ formatCredits(quota.platform.credits, { creditDigits: 0, yuanDigits: 2 }) }}</div>
          <div class="qc-hint">共享 Key 模式生图消耗此余额；使用个人 Key 时不消耗</div>
        </div>
      </div>

      <div class="txn-section">
        <h3 class="section-title">最近积分流水</h3>
        <el-table :data="quota?.recentTransactions || []" stripe size="small" empty-text="暂无流水">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ toBJMinute(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="变动" width="180">
            <template #default="{ row }">
              <span :style="{ color: row.amount >= 0 ? 'var(--el-color-success)' : 'var(--el-color-danger)', fontWeight: 600 }">
                {{ row.amount >= 0 ? '+' : '' }}{{ formatCredits(row.amount, { creditsOnly: true }) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="变动后余额" width="180">
            <template #default="{ row }">{{ formatCredits(row.balance_after, { creditDigits: 0, yuanDigits: 2 }) }}</template>
          </el-table-column>
          <el-table-column label="说明">
            <template #default="{ row }">{{ reasonLabel[row.reason] || row.reason }}{{ row.note ? ' · ' + row.note : '' }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- ─── 个人 Key 分支 ─── -->
    <div v-else v-loading="loading">
      <!-- 个人 Key 余额（与平台积分余额同款卡片） -->
      <div class="cards">
        <div class="quota-card">
          <div class="qc-header">
            <el-icon size="18" color="var(--el-color-primary)"><Key /></el-icon>
            <span>个人 Key 余额</span>
            <el-button
              class="qc-action"
              size="small" text type="primary" :icon="Refresh"
              :loading="serverStatus.balanceRefreshing"
              :disabled="!serverStatus.usingPersonalKey"
              @click="serverStatus.refreshPersonalBalance()"
            >刷新</el-button>
          </div>
          <div v-if="serverStatus.usingPersonalKey && serverStatus.personalKeyCredits !== null" class="qc-value">
            {{ formatCredits(serverStatus.personalKeyCredits, { creditDigits: 0, yuanDigits: 2 }) }}
          </div>
          <div v-else-if="serverStatus.personalKeyBalanceError" class="qc-value qc-pending danger">查询失败</div>
          <div v-else-if="serverStatus.usingPersonalKey" class="qc-value qc-pending">
            {{ serverStatus.balanceRefreshing ? '查询中…' : '新积分待接口' }}
          </div>
          <div v-else class="qc-value qc-pending">未启用</div>
          <div class="qc-hint">
            <span v-if="!serverStatus.usingPersonalKey">保存并启用个人 Key 后显示余额</span>
            <span v-else-if="serverStatus.personalKeyBalanceAt">更新于 {{ formatTime(serverStatus.personalKeyBalanceAt) }}</span>
            <span v-else>获取中…</span>
          </div>
        </div>
      </div>

      <!-- 配置入口 -->
      <div class="cfg-entry">
        <el-button type="primary" size="large" :icon="Setting" @click="openKeyDialog">配置个人 Key</el-button>
      </div>

      <!-- 配置弹窗 -->
      <el-dialog v-model="showKeyDialog" title="配置个人 Key" width="540px" align-center>
        <div class="dialog-cfg">
          <div class="cfg-row">
            <el-input
              v-model="apiKey"
              type="password"
              show-password
              placeholder="输入你的 ToAPIs API Key"
            />
            <p v-if="keyHint" class="current-key-info">已保存 Key：{{ keyHint }}</p>
          </div>
          <div class="cfg-actions">
            <el-button type="primary" @click="handleSave" :loading="saving" :disabled="!apiKey.trim()">保存</el-button>
            <el-button @click="handleTest" :loading="testing" :disabled="!apiKey.trim()">测试连接</el-button>
            <el-button type="danger" plain @click="handleDeleteKey" :disabled="!hasPersonalKey">清空</el-button>
          </div>

          <!-- 余额查询间隔 -->
          <div class="interval-block">
            <div class="interval-row">
              <span class="interval-label">余额查询间隔</span>
              <el-input-number
                v-model="intervalSec"
                :min="0"
                :max="604800"
                :step="1"
                size="small"
                controls-position="right"
                :disabled="savingInterval"
                @change="handleIntervalChange"
              />
              <span class="interval-unit">秒</span>
            </div>
            <div class="interval-quick">
              <el-button
                v-for="opt in intervalQuickOptions"
                :key="opt.value"
                size="small"
                :type="intervalSec === opt.value ? 'primary' : 'default'"
                plain
                @click="handleIntervalChange(opt.value)"
              >{{ opt.label }}</el-button>
            </div>
            <p class="interval-tip">
              {{ intervalSec === 0
                ? '已设为不自动查询，仅手动点击「刷新」'
                : `每 ${formatInterval(intervalSec)} 自动查询一次（头像与本页同步刷新）` }}
            </p>
          </div>
        </div>
      </el-dialog>
    </div>
  </PageLayout>
</template>

<style scoped>
.mode-switch-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  padding: 20px 24px;
  margin-bottom: 20px;
}
.ms-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}
.ms-group {
  display: flex;
}
.ms-group :deep(.el-radio-button) {
  flex: 1;
}
.ms-group :deep(.el-radio-button__inner) {
  width: 100%;
  font-size: var(--momo-font-size-base);
  padding: 14px 0;
}
.ms-icon {
  margin-right: 4px;
  vertical-align: -2px;
}
.ms-hint {
  margin-top: 12px;
  font-size: var(--momo-font-size-sm);
}
.ms-tag { font-weight: 500; }
.ms-tag.personal { color: var(--el-color-success); }
.ms-tag.platform { color: var(--el-color-warning); }

.cards {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}
.quota-card {
  flex: 1;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  padding: 20px 24px;
}
.quota-card.primary {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-5);
}
.qc-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}
.qc-action {
  margin-left: auto;
}
.qc-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}
.qc-value.qc-pending {
  font-size: var(--momo-font-size-lg, 18px);
  font-weight: 500;
  color: var(--el-text-color-placeholder);
}
.qc-value.qc-pending.danger {
  color: var(--el-color-danger);
}
.qc-hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.txn-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  padding: 16px 20px;
}
.section-title {
  margin: 0 0 12px 0;
  font-size: var(--momo-font-size-base, 14px);
  font-weight: 600;
}

.cfg-entry {
  display: flex;
}

/* 弹窗内的配置表单 */
.dialog-cfg .cfg-row { margin-bottom: 12px; }
.current-key-info {
  margin: 6px 0 0 0;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  font-family: monospace;
}
.cfg-actions {
  display: flex;
  gap: 8px;
}

.interval-block {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.interval-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.interval-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}
.interval-unit {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}
.interval-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.interval-tip {
  margin: 10px 0 0 0;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
}
</style>
