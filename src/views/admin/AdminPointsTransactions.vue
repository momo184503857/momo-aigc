<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toBJSecond } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { error } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import { formatCredits } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'

interface TxnRow {
  id: number
  user_id: number
  username: string
  amount: number
  balance_after: number
  reason: string
  reference_type: string | null
  reference_id: number | null
  operator_name: string
  note: string
  created_at: string
}

const records = ref<TxnRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterUserId = ref('')
const filterReason = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')

const reasonLabel: Record<string, string> = {
  generation: '生成消耗',
  admin_recharge: '管理员充值',
  admin_deduct: '管理员扣减',
}

async function load() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    if (filterUserId.value) params.user_id = Number(filterUserId.value)
    if (filterReason.value) params.reason = filterReason.value
    if (filterStartDate.value) params.start_date = filterStartDate.value
    if (filterEndDate.value) params.end_date = filterEndDate.value
    const res = await adminApi.listTransactions(params)
    records.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
  } catch {
    error('加载交易记录失败')
  } finally {
    loading.value = false
  }
}

function handlePageChange(p: number) {
  page.value = p
  load()
}

function handleSearch() {
  page.value = 1
  load()
}

onMounted(() => load())
</script>

<template>
  <PageLayout>
    <template #header><h2>积分流水</h2></template>

    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end">
      <el-input v-model="filterUserId" placeholder="用户ID" clearable style="width:120px" />
      <el-select v-model="filterReason" placeholder="原因" clearable style="width:150px">
        <el-option label="生成消耗" value="generation" />
        <el-option label="管理员充值" value="admin_recharge" />
        <el-option label="管理员扣减" value="admin_deduct" />
      </el-select>
      <el-date-picker v-model="filterStartDate" type="date" placeholder="开始日期" value-format="YYYY-MM-DD" style="width:160px" />
      <el-date-picker v-model="filterEndDate" type="date" placeholder="结束日期" value-format="YYYY-MM-DD" style="width:160px" />
      <el-button type="primary" @click="handleSearch">查询</el-button>
    </div>

    <el-table :data="records" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户" width="120" />
      <el-table-column label="积分" width="170">
        <template #default="{ row }">
          <span :style="{ color: row.amount >= 0 ? 'var(--el-color-success)' : 'var(--el-color-danger)', fontWeight: 600 }">
            {{ row.amount >= 0 ? '+' : '' }}{{ formatCredits(row.amount, { creditsOnly: true }) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="变动后余额" width="170">
        <template #default="{ row }">{{ formatCredits(row.balance_after, { creditDigits: 0, yuanDigits: 2 }) }}</template>
      </el-table-column>
      <el-table-column label="原因" width="120">
        <template #default="{ row }">{{ reasonLabel[row.reason] || row.reason }}</template>
      </el-table-column>
      <el-table-column label="操作人" width="100">
        <template #default="{ row }">{{ row.operator_name || '系统' }}</template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="120" />
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ toBJSecond(row.created_at) }}</template>
      </el-table-column>
    </el-table>

    <div style="margin-top:16px;text-align:right">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
  </PageLayout>
</template>
