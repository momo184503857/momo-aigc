<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error } = useUiFeedback()
import http from '@/services/http'
import { adminApi } from '@/services/adminApi'
import { Key, CreditCard } from '@element-plus/icons-vue'
import { creditsToYuan } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'AdminToApisKey' })

const apiKey = ref('')
const maskedKey = ref('')
const loading = ref(false)
const testing = ref(false)
const saving = ref(false)

// Balance (API 返回 USD，1 USD ≈ 7.24 CNY，1 USD = 200 credits)
const USD_TO_CNY = 7.24
const tokenRemainCNY = ref<number | null>(null)
const tokenRemainCredits = ref<number | null>(null)
const tokenUsedCNY = ref<number | null>(null)
const tokenUsedCredits = ref<number | null>(null)
const userRemainCNY = ref<number | null>(null)
const userRemainCredits = ref<number | null>(null)
const userUsedCNY = ref<number | null>(null)
const userUsedCredits = ref<number | null>(null)
const balanceLoading = ref(false)

function toCNY(usd: number) {
  return Math.round(usd * USD_TO_CNY * 100) / 100
}

async function loadConfig() {
  loading.value = true
  try {
    const res = await http.get('/admin/toapis/config')
    maskedKey.value = res.data.data.maskedKey || ''
  } catch (e: any) {
    error('加载配置失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!apiKey.value.trim()) {
    warning('请输入 API Key')
    return
  }
  saving.value = true
  try {
    await http.put('/admin/toapis/config', { apiKey: apiKey.value.trim() })
    success('保存成功')
    apiKey.value = ''
    await loadConfig()
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
    const res = await http.post('/admin/toapis/test', { apiKey: key })
    if (res.data.data.ok) {
      success('连接成功，API Key 有效')
    } else {
      error('连接失败，API Key 无效')
    }
  } catch (e: any) {
    error('测试失败: ' + (e.response?.data?.error || e.message))
  } finally {
    testing.value = false
  }
}

async function handleDeleteKey() {
  try {
    await http.delete('/admin/toapis/key')
    success('共享 Key 已清空')
    apiKey.value = ''
    tokenRemainCNY.value = null
    tokenRemainCredits.value = null
    tokenUsedCNY.value = null
    tokenUsedCredits.value = null
    userRemainCNY.value = null
    userRemainCredits.value = null
    userUsedCNY.value = null
    userUsedCredits.value = null
    await loadConfig()
  } catch (e: any) {
    error('清空失败: ' + (e.response?.data?.error || e.message))
  }
}

async function handleCheckBalance() {
  balanceLoading.value = true
  try {
    const [tokenRes, userRes] = await Promise.allSettled([
      adminApi.getToApisBalance(),
      adminApi.getToApisUserBalance(),
    ])
    if (tokenRes.status === 'fulfilled' && tokenRes.value.data.success) {
      const d = tokenRes.value.data.data
      tokenRemainCNY.value = toCNY(d.balance)
      tokenRemainCredits.value = d.credits
    } else if (tokenRes.status === 'fulfilled') {
      error('查询令牌余额失败: ' + (tokenRes.value.data.error || '未知错误'))
    }
    if (userRes.status === 'fulfilled' && userRes.value.data.success) {
      const d = userRes.value.data.data
      userRemainCNY.value = toCNY(d.balance)
      userRemainCredits.value = d.credits
    } else if (userRes.status === 'fulfilled') {
      error('查询账户余额失败: ' + (userRes.value.data.error || '未知错误'))
    }
    if (tokenRes.status === 'rejected' && userRes.status === 'rejected') {
      error('查询余额失败')
    }
  } catch { /* ignore */ }
  finally { balanceLoading.value = false }
}

onMounted(() => loadConfig())
</script>

<template>
  <PageLayout>
    <template #header><h2>API Key 管理</h2></template>

    <div v-loading="loading">
      <p class="page-desc">配置所有用户共享的 ToAPIs API Key。修改后立即生效。</p>

      <div class="config-section">
        <div class="config-row">
          <label class="config-label">共享 Key</label>
          <div class="config-control">
            <el-input v-model="apiKey" type="password" show-password placeholder="输入 ToAPIs API Key" />
            <p v-if="maskedKey" class="current-key-info">当前 Key：{{ maskedKey }}</p>
          </div>
        </div>
        <div class="config-row">
          <label class="config-label"></label>
          <div class="config-control config-actions">
            <el-button type="primary" @click="handleSave" :loading="saving" :disabled="!apiKey.trim()">保存</el-button>
            <el-button @click="handleTest" :loading="testing" :disabled="!apiKey.trim()">测试连接</el-button>
            <el-button type="danger" plain @click="handleDeleteKey" :disabled="!maskedKey">清空 Key</el-button>
          </div>
        </div>
      </div>

      <!-- Balance Section -->
      <div class="balance-section" v-if="maskedKey">
        <div class="balances-row">
          <!-- 账户余额 -->
          <div class="balance-card" :class="{ low: userRemainCNY !== null && userRemainCNY <= 0 }">
            <div class="balance-header">
              <el-icon size="18" color="var(--el-color-success)"><CreditCard /></el-icon>
              <span>账户余额</span>
            </div>
            <div class="balance-body">
              <div v-if="userRemainCNY !== null" class="balance-value">
                <span class="balance-amount" :class="{ danger: userRemainCNY <= 0 }">{{ userRemainCredits ?? 0 }} 积分</span>
                <span class="balance-credits">¥{{ creditsToYuan(userRemainCredits ?? 0) }}</span>
              </div>
              <div v-else class="balance-unknown">--</div>
            </div>
          </div>

          <!-- 令牌余额 -->
          <div class="balance-card" :class="{ low: tokenRemainCNY !== null && tokenRemainCNY <= 0 }">
            <div class="balance-header">
              <el-icon size="18" color="var(--el-color-primary)"><Key /></el-icon>
              <span>令牌余额</span>
            </div>
            <div class="balance-body">
              <div v-if="tokenRemainCNY !== null" class="balance-value">
                <span class="balance-amount" :class="{ danger: tokenRemainCNY <= 0 }">{{ tokenRemainCredits ?? 0 }} 积分</span>
                <span class="balance-credits">¥{{ creditsToYuan(tokenRemainCredits ?? 0) }}</span>
              </div>
              <div v-else class="balance-unknown">--</div>
            </div>
          </div>
        </div>

        <el-button @click="handleCheckBalance" :loading="balanceLoading" style="margin-top:12px">
          检测余额
        </el-button>
        <p v-if="(tokenRemainCNY !== null && tokenRemainCNY <= 0) || (userRemainCNY !== null && userRemainCNY <= 0)" class="recharge-warning">
          余额不足，请前往 ToAPIs 充值后再使用！
        </p>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.page-desc {
  margin: 0 0 24px 0;
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-secondary);
}

.config-section {
  background: var(--el-bg-color);
  border-radius: var(--momo-radius-md);
  padding: 24px;
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 24px;
}

.config-row {
  display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px;
}
.config-row:last-child { margin-bottom: 0; }

.config-label {
  width: 80px; flex-shrink: 0; text-align: right;
  font-size: var(--momo-font-size-base); font-weight: 500;
  color: var(--el-text-color-primary); padding-top: 6px;
}

.config-control { flex: 1; min-width: 0; }
.config-actions { display: flex; gap: 8px; }
.current-key-info {
  margin: 6px 0 0 0; font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary); font-family: monospace;
}

.balance-section { margin-top: 0; }

.balances-row {
  display: flex; gap: 16px;
}

.balance-card {
  flex: 1;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 20px 24px;
  transition: box-shadow 0.2s;
}
.balance-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.balance-card.low {
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-5);
}

.balance-header {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 12px;
}

.balance-body { text-align: center; }
.balance-value { margin-bottom: 4px; }
.balance-amount {
  font-size: 28px; font-weight: 700; color: var(--el-text-color-primary);
}
.balance-amount.danger { color: var(--el-color-danger); }
.balance-credits {
  display: block;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.balance-unknown {
  font-size: 24px; color: var(--el-text-color-placeholder); margin-bottom: 4px;
}

.recharge-warning {
  margin: 12px 0 0 0;
  color: var(--el-color-danger);
  font-size: var(--momo-font-size-base); font-weight: 500;
}
</style>
