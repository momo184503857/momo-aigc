<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { pointsApi } from '@/services/pointsApi'
import { formatCredits } from '@/types/adapter'
import { Coin } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'MyQuota' })

/**
 * 我的额度（fixed-channels：渠道由平台统一配置，计费单轨积分）。
 * 所有模型生图按定价扣积分（本页展示余额与流水）；生成失败自动全额退款。
 */
const { error } = useUiFeedback()

interface QuotaData {
  platform: { credits: number; yuan: number }
  recentTransactions: Array<{
    id: number; amount: number; balance_after: number
    reason: string; note: string; created_at: string
  }>
}

const quota = ref<QuotaData | null>(null)
const loading = ref(false)

const reasonLabel: Record<string, string> = {
  generation: '生图扣费',
  admin_recharge: '管理员充值',
  admin_deduct: '管理员扣减',
  refund: '失败退款',
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await pointsApi.getMyQuota()
    quota.value = res.data.data
  } catch (e: any) {
    error('加载额度失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <PageLayout>
    <template #header><h2>我的额度</h2></template>

    <el-alert
      class="mode-note"
      type="info" :closable="false" show-icon
      title="所有模型按「渠道 × 模型 × 分辨率」定价扣积分（消耗下方余额）；生成失败自动全额退款。"
    />

    <div v-loading="loading">
      <div class="cards">
        <div class="quota-card primary">
          <div class="qc-header">
            <el-icon size="18" color="var(--el-color-warning)"><Coin /></el-icon>
            <span>平台积分余额</span>
          </div>
          <div v-if="quota" class="qc-value">{{ formatCredits(quota.platform.credits, { creditDigits: 0, yuanDigits: 2 }) }}</div>
          <div class="qc-hint">模型生图消耗此余额；生成失败自动全额退款</div>
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
  </PageLayout>
</template>

<style scoped>
.mode-note {
  margin-bottom: 20px;
}

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
.entry-arrow {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}
.qc-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}
.qc-value.qc-value-sm {
  font-size: var(--momo-font-size-lg, 18px);
  font-weight: 600;
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
