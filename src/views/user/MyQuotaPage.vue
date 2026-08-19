<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { pointsApi } from '@/services/pointsApi'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { formatCredits } from '@/types/adapter'
import { Coin, Connection, Right } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'MyQuota' })

/**
 * 我的额度（ai-provider 重构后）：
 * 旧「平台积分 / 个人 Key」全局开关已退役（S4）——费用模式随所选模型自动判定。
 * 平台模型消耗积分（本页展示余额与流水）；「我的渠道」模型不扣积分（入口见下方卡片）。
 */
const { error } = useUiFeedback()
const router = useRouter()
const modelCatalog = useModelCatalogStore()

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

/** 我的渠道分组（入口卡片展示渠道数与模型数） */
const mineSummary = ref({ channels: 0, models: 0 })

onMounted(async () => {
  load()
  await modelCatalog.ensureLoaded()
  const mine = modelCatalog.imageGroups.filter((g) => g.mine)
  mineSummary.value = {
    channels: mine.length,
    models: mine.reduce((s, g) => s + g.models.length, 0),
  }
})
</script>

<template>
  <PageLayout>
    <template #header><h2>我的额度</h2></template>

    <el-alert
      class="mode-note"
      type="info" :closable="false" show-icon
      title="计费方式随所选模型自动判定：平台渠道模型按积分计费（消耗下方余额）；「我的渠道」模型生图不扣积分。"
    />

    <div v-loading="loading">
      <div class="cards">
        <div class="quota-card primary">
          <div class="qc-header">
            <el-icon size="18" color="var(--el-color-warning)"><Coin /></el-icon>
            <span>平台积分余额</span>
          </div>
          <div v-if="quota" class="qc-value">{{ formatCredits(quota.platform.credits, { creditDigits: 0, yuanDigits: 2 }) }}</div>
          <div class="qc-hint">平台渠道模型生图消耗此余额；生成失败自动全额退款</div>
        </div>

        <div class="quota-card mine-entry" @click="router.push('/my-channels')">
          <div class="qc-header">
            <el-icon size="18" color="var(--el-color-primary)"><Connection /></el-icon>
            <span>我的渠道</span>
            <el-icon class="entry-arrow"><Right /></el-icon>
          </div>
          <div class="qc-value qc-value-sm">
            {{ mineSummary.channels > 0 ? `${mineSummary.channels} 个渠道 · ${mineSummary.models} 个模型` : '未配置' }}
          </div>
          <div class="qc-hint">
            {{ mineSummary.channels > 0 ? '我的渠道模型生图不扣积分，前往管理渠道与余额' : '自建渠道（协议 + Base URL + Key）后可用个人渠道生图，不扣积分' }}
          </div>
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
.quota-card.mine-entry {
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.quota-card.mine-entry:hover {
  border-color: var(--el-color-primary);
  box-shadow: var(--el-box-shadow-light);
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
