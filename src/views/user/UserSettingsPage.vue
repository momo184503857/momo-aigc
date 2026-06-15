<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { userKeyApi } from '@/services/userKeyApi'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useAuthStore } from '@/stores/auth'
import { pointsApi } from '@/services/pointsApi'
import { formatCredits } from '@/types/adapter'
import { Key, Coin, CreditCard } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'UserSettings' })

const { success, warning, error } = useUiFeedback()
const serverStatus = useServerStatusStore()
const auth = useAuthStore()

const apiKey = ref('')
const hasPersonalKey = ref(false)
const keyHint = ref('')
const usePersonalKey = ref(false)
const sharedKeyConfigured = ref(false)
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)

// 个人 key 的 ToAPIs 余额（自查）
const USD_TO_CNY = 7.24
const personalRemainCNY = ref<number | null>(null)
const personalCredits = ref<number | null>(null)
const balanceLoading = ref(false)

// 平台积分
const platformPoints = ref<number>(auth.user?.points ?? 0)

const canUsePersonal = computed(() => hasPersonalKey.value)

function toCNY(usd: number) {
  return Math.round(usd * USD_TO_CNY * 100) / 100
}

async function loadConfig() {
  loading.value = true
  try {
    const res = await userKeyApi.getKeyConfig()
    const d = res.data.data
    hasPersonalKey.value = d.hasPersonalKey
    keyHint.value = d.keyHint
    usePersonalKey.value = d.usePersonalKey
    sharedKeyConfigured.value = d.sharedKeyConfigured
    // 同步全局 store
    await serverStatus.refreshKeyConfig()
  } catch (e: any) {
    error('加载配置失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
}

async function loadPlatformPoints() {
  try {
    const res = await pointsApi.getMyBalance()
    platformPoints.value = res.data.data.balance
  } catch { /* ignore */ }
}

async function handleSave() {
  if (!apiKey.value.trim()) {
    warning('请输入 API Key')
    return
  }
  saving.value = true
  try {
    const res = await userKeyApi.saveKey(apiKey.value.trim())
    hasPersonalKey.value = res.data.data.hasPersonalKey
    keyHint.value = res.data.data.keyHint
    apiKey.value = ''
    personalRemainCNY.value = null
    personalCredits.value = null
    success('个人 Key 已保存')
    await serverStatus.refreshKeyConfig()
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
    usePersonalKey.value = false
    apiKey.value = ''
    personalRemainCNY.value = null
    personalCredits.value = null
    success('个人 Key 已清空，已回退到共享 Key')
    await serverStatus.refreshKeyConfig()
  } catch (e: any) {
    error('清空失败: ' + (e.response?.data?.error || e.message))
  }
}

async function handleModeChange(val: boolean | string | number) {
  const wantPersonal = val === 'personal'
  if (wantPersonal && !hasPersonalKey.value) {
    warning('请先保存个人 Key')
    return
  }
  try {
    await userKeyApi.setMode(wantPersonal)
    usePersonalKey.value = wantPersonal
    await serverStatus.refreshKeyConfig()
    success(wantPersonal ? '已切换到个人 Key（不消耗积分）' : '已切换到共享 Key（消耗积分）')
  } catch (e: any) {
    error('切换失败: ' + (e.response?.data?.error || e.message))
    // 回滚 UI
    usePersonalKey.value = !wantPersonal
  }
}

async function handleCheckBalance() {
  balanceLoading.value = true
  try {
    const res = await userKeyApi.getBalance()
    if (res.data.success) {
      personalRemainCNY.value = toCNY(res.data.data.balance)
      personalCredits.value = res.data.data.credits
    } else {
      error('查询余额失败: ' + (res.data.error || '请检查个人 Key 是否有效'))
    }
  } catch (e: any) {
    error('查询余额失败: ' + (e.response?.data?.error || e.message))
  } finally {
    balanceLoading.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadPlatformPoints()
})
</script>

<template>
  <PageLayout>
    <template #header><h2>个人设置</h2></template>

    <div v-loading="loading">
      <p class="page-desc">
        配置你自己的 ToAPIs API Key。使用个人 Key 生图时，费用由你的 ToAPIs 账户直接承担，<b>不消耗平台积分</b>；
        使用共享 Key 时则按平台单价消耗积分。可随时切换。
      </p>

      <!-- 当前模式 -->
      <div class="mode-section">
        <div class="section-title">当前使用的 Key</div>
        <el-radio-group
          :model-value="usePersonalKey ? 'personal' : 'shared'"
          @change="handleModeChange"
        >
          <el-radio value="shared">共享 Key（消耗积分）</el-radio>
          <el-radio value="personal" :disabled="!canUsePersonal">
            个人 Key（不消耗积分）
          </el-radio>
        </el-radio-group>
        <el-alert
          v-if="usePersonalKey"
          type="success" :closable="false" show-icon
          class="mode-alert"
          title="当前使用个人 Key 生图，不消耗平台积分。"
        />
        <el-alert
          v-else
          type="info" :closable="false" show-icon
          class="mode-alert"
          :title="sharedKeyConfigured
            ? '当前使用共享 Key 生图，按平台单价消耗积分。'
            : '管理员尚未配置共享 Key，请配置个人 Key 后切换到个人模式即可生图。'"
        />
      </div>

      <!-- 个人 Key 配置 -->
      <div class="config-section">
        <div class="section-title">个人 API Key</div>
        <div class="config-row">
          <el-input
            v-model="apiKey"
            type="password"
            show-password
            placeholder="输入你的 ToAPIs API Key"
          />
          <p v-if="keyHint" class="current-key-info">已保存 Key：{{ keyHint }}</p>
        </div>
        <div class="config-actions">
          <el-button type="primary" @click="handleSave" :loading="saving" :disabled="!apiKey.trim()">保存</el-button>
          <el-button @click="handleTest" :loading="testing" :disabled="!apiKey.trim()">测试连接</el-button>
          <el-button type="danger" plain @click="handleDeleteKey" :disabled="!hasPersonalKey">清空</el-button>
        </div>

        <!-- 个人 Key 余额 -->
        <div v-if="hasPersonalKey" class="personal-balance">
          <div class="balance-card" :class="{ low: personalRemainCNY !== null && personalRemainCNY <= 0 }">
            <div class="balance-header">
              <el-icon size="18" color="var(--el-color-primary)"><Key /></el-icon>
              <span>个人 Key 余额（ToAPIs）</span>
            </div>
            <div class="balance-body">
              <div v-if="personalRemainCNY !== null" class="balance-value">
                <span class="balance-amount" :class="{ danger: personalRemainCNY <= 0 }">¥{{ personalRemainCNY }}</span>
                <span v-if="personalCredits !== null" class="balance-credits">{{ personalCredits }} credits</span>
              </div>
              <div v-else class="balance-unknown">--</div>
            </div>
          </div>
          <el-button @click="handleCheckBalance" :loading="balanceLoading" size="small">检测余额</el-button>
          <p v-if="personalRemainCNY !== null && personalRemainCNY <= 0" class="recharge-warning">
            余额不足，请前往 ToAPIs 充值后再使用个人 Key。
          </p>
        </div>
      </div>

      <!-- 平台积分（仅共享模式下相关，但始终展示） -->
      <div class="points-section">
        <div class="balance-card">
          <div class="balance-header">
            <el-icon size="18" color="var(--el-color-warning)"><Coin /></el-icon>
            <span>平台积分（共享 Key 模式消耗）</span>
          </div>
          <div class="balance-body">
            <span class="balance-amount">{{ formatCredits(platformPoints, { creditDigits: 0, yuanDigits: 2 }) }}</span>
            <span class="balance-credits">使用个人 Key 时不消耗</span>
          </div>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.page-desc {
  margin: 0 0 24px 0;
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.section-title {
  font-size: var(--momo-font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

.mode-section,
.config-section,
.points-section {
  background: var(--el-bg-color);
  border-radius: var(--momo-radius-md);
  padding: 20px 24px;
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 16px;
}

.mode-alert {
  margin-top: 12px;
}

.config-row {
  margin-bottom: 12px;
}

.current-key-info {
  margin: 6px 0 0 0;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.config-actions {
  display: flex;
  gap: 8px;
}

.personal-balance {
  margin-top: 16px;
}

.balance-card {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.balance-card.low {
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-5);
}

.balance-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.balance-body {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.balance-amount {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.balance-amount.danger {
  color: var(--el-color-danger);
}

.balance-credits {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.balance-unknown {
  font-size: 22px;
  color: var(--el-text-color-placeholder);
}

.recharge-warning {
  margin: 10px 0 0 0;
  color: var(--el-color-danger);
  font-size: var(--momo-font-size-sm);
}
</style>
