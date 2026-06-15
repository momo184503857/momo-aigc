<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { pointsApi } from '@/services/pointsApi'
import { formatCredits } from '@/types/adapter'
import { Coin, Key } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'MyQuota' })

const { error } = useUiFeedback()

interface QuotaData {
  platform: { credits: number; yuan: number }
  recentTransactions: Array<{
    id: number; amount: number; balance_after: number
    reason: string; note: string; created_at: string
  }>
  personalKeyCredits: { credits: number | null; placeholderCNY: number | null; currency: string } | null
}

const quota = ref<QuotaData | null>(null)
const loading = ref(false)

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

const reasonLabel: Record<string, string> = {
  generation: '生图扣费',
  admin_recharge: '管理员充值',
  admin_deduct: '管理员扣减',
}

onMounted(load)
</script>

<template>
  <PageLayout>
    <template #header><h2>我的额度</h2></template>

    <div v-loading="loading">
      <div class="cards">
        <!-- 平台新积分余额 -->
        <div class="quota-card primary">
          <div class="qc-header">
            <el-icon size="18" color="var(--el-color-warning)"><Coin /></el-icon>
            <span>平台积分余额</span>
          </div>
          <div v-if="quota" class="qc-value">{{ formatCredits(quota.platform.credits, { creditDigits: 0, yuanDigits: 2 }) }}</div>
          <div class="qc-hint">共享 Key 模式生图消耗此余额；使用个人 Key 时不消耗</div>
        </div>

        <!-- Key 余额 -->
        <div class="quota-card">
          <div class="qc-header">
            <el-icon size="18" color="var(--el-color-primary)"><Key /></el-icon>
            <span>Key 余额</span>
          </div>
          <template v-if="quota">
            <div v-if="quota.personalKeyCredits" class="qc-row">
              <span class="qc-label">个人 Key：</span>
              <span v-if="quota.personalKeyCredits.credits !== null" class="qc-inline">
                {{ formatCredits(quota.personalKeyCredits.credits, { creditDigits: 0, yuanDigits: 2 }) }}
              </span>
              <span v-else class="qc-pending">
                新积分待接口（当前 ToAPIs 余额：¥{{ quota.personalKeyCredits.placeholderCNY ?? '--' }}）
              </span>
            </div>
            <div v-else class="qc-row qc-pending">个人 Key：未配置</div>
            <div class="qc-row qc-hint">共享 Key：平台聚合计费，见左侧平台积分余额</div>
          </template>
        </div>
      </div>

      <!-- 最近积分流水 -->
      <div class="txn-section">
        <h3 class="section-title">最近积分流水</h3>
        <el-table :data="quota?.recentTransactions || []" stripe size="small" empty-text="暂无流水">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ row.created_at?.slice(0, 16) }}</template>
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
  </PageLayout>
</template>

<style scoped>
.cards {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
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
.qc-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}
.qc-row {
  font-size: var(--momo-font-size-base, 14px);
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.qc-inline {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.qc-label {
  color: var(--el-text-color-secondary);
}
.qc-pending {
  color: var(--el-text-color-secondary);
  font-size: 13px;
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
</style>
