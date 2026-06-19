<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { toBJMinute, toBJDate } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { error } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import { formatCredits } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'

interface StatRow {
  user_id: number
  username: string
  role: string
  status: string
  points: number
  submitted_count: number
  completed_count: number
  failed_count: number
  total_cost: number
  last_submitted_at: string | null
  last_completed_at: string | null
}

interface DailyRow {
  date: string
  total_tasks: number
  completed: number
  failed: number
  in_progress: number
  total_cost: number
}

interface SummaryData {
  total_tasks: number
  total_completed: number
  total_failed: number
  total_points_consumed: number
  active_users: number
  total_balance: number
}

const stats = ref<StatRow[]>([])
const dailyStats = ref<DailyRow[]>([])
const summary = ref<SummaryData>({
  total_tasks: 0, total_completed: 0, total_failed: 0,
  total_points_consumed: 0, active_users: 0, total_balance: 0,
})
const loading = ref(false)
const chartDays = ref(30)

const totalSubmitted = computed(() => stats.value.reduce((s, r) => s + r.submitted_count, 0))
const totalCompleted = computed(() => stats.value.reduce((s, r) => s + r.completed_count, 0))
const totalFailed = computed(() => stats.value.reduce((s, r) => s + r.failed_count, 0))

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['总任务', '成功', '失败'], bottom: 0 },
  grid: { left: '3%', right: '4%', bottom: '30px', top: '10px', containLabel: true },
  xAxis: { type: 'category' as const, data: dailyStats.value.map(d => d.date), axisLabel: { rotate: 45 } },
  yAxis: { type: 'value' as const, minInterval: 1 },
  series: [
    { name: '总任务', type: 'line', data: dailyStats.value.map(d => d.total_tasks), smooth: true },
    { name: '成功', type: 'line', data: dailyStats.value.map(d => d.completed), smooth: true },
    { name: '失败', type: 'line', data: dailyStats.value.map(d => d.failed), smooth: true },
  ],
}))

const pieOption = computed(() => ({
  tooltip: { trigger: 'item' as const },
  legend: { bottom: 0 },
  series: [{
    name: '任务分布',
    type: 'pie',
    radius: ['40%', '70%'],
    data: [
      { value: summary.value.total_completed, name: '成功' },
      { value: summary.value.total_failed, name: '失败' },
      { value: summary.value.total_tasks - summary.value.total_completed - summary.value.total_failed, name: '进行中' },
    ],
    emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
  }],
}))

const barOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  grid: { left: '3%', right: '4%', bottom: '10px', top: '10px', containLabel: true },
  xAxis: { type: 'category' as const, data: stats.value.map(s => s.username), axisLabel: { rotate: 30 } },
  yAxis: { type: 'value' as const, minInterval: 1 },
  series: [
    { name: '成功', type: 'bar', data: stats.value.map(s => s.completed_count), stack: 'x' },
    { name: '失败', type: 'bar', data: stats.value.map(s => s.failed_count), stack: 'x' },
  ],
}))

async function loadAll() {
  loading.value = true
  try {
    const [statsRes, dailyRes, summaryRes] = await Promise.all([
      adminApi.getStats(),
      adminApi.getDailyStats({ start_date: daysAgo(chartDays.value) }),
      adminApi.getStatsSummary(),
    ])
    stats.value = statsRes.data.data || []
    dailyStats.value = dailyRes.data.data || []
    summary.value = summaryRes.data.data || summary.value
  } catch {
    error('加载统计失败')
  } finally {
    loading.value = false
  }
}

function daysAgo(days: number): string {
  return toBJDate(new Date(Date.now() - days * 24 * 3600 * 1000).toISOString())
}

function handleDaysChange(days: number) {
  chartDays.value = days
  loadAll()
}

onMounted(() => loadAll())
</script>

<template>
  <PageLayout>
    <template #header><h2>生成统计</h2></template>

    <div v-loading="loading">
      <!-- Summary Cards -->
      <el-row :gutter="16" style="margin-bottom: 24px">
        <el-col :span="4">
          <el-statistic title="总提交" :value="summary.total_tasks" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="总成功" :value="summary.total_completed" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="总失败" :value="summary.total_failed" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="积分消耗" :value="summary.total_points_consumed" :precision="0" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="活跃用户" :value="summary.active_users" />
        </el-col>
        <el-col :span="4">
          <el-statistic title="总积分余额" :value="summary.total_balance" :precision="0" />
        </el-col>
      </el-row>

      <!-- Charts -->
      <el-row :gutter="16" style="margin-bottom:24px">
        <el-col :span="16">
          <el-card shadow="never">
            <template #header>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span>每日生成趋势</span>
                <el-radio-group v-model="chartDays" size="small" @change="handleDaysChange(chartDays)">
                  <el-radio-button :value="7">7天</el-radio-button>
                  <el-radio-button :value="30">30天</el-radio-button>
                  <el-radio-button :value="90">90天</el-radio-button>
                </el-radio-group>
              </div>
            </template>
            <VChart :option="trendOption" style="height:300px" autoresize />
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="never" header="任务占比">
            <VChart :option="pieOption" style="height:300px" autoresize />
          </el-card>
        </el-col>
      </el-row>

      <!-- Bar chart per user -->
      <el-card shadow="never" style="margin-bottom:24px">
        <template #header><span>用户生成统计</span></template>
        <VChart v-if="stats.length > 0" :option="barOption" style="height:300px" autoresize />
        <el-empty v-else description="暂无数据" />
      </el-card>

      <!-- User table -->
      <el-table :data="stats" stripe>
        <el-table-column prop="username" label="用户名" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
              {{ row.status === 'active' ? '正常' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="积分" width="170">
          <template #default="{ row }">
            <span :style="{ color: row.points <= 0 ? 'var(--el-color-danger)' : 'inherit' }">{{ formatCredits(row.points, { creditDigits: 0, yuanDigits: 2 }) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="提交" prop="submitted_count" sortable width="80" />
        <el-table-column label="成功" prop="completed_count" sortable width="80" />
        <el-table-column label="失败" prop="failed_count" sortable width="80" />
        <el-table-column label="积分消耗" sortable width="170">
          <template #default="{ row }">{{ formatCredits(row.total_cost, { creditDigits: 0, yuanDigits: 2 }) }}</template>
        </el-table-column>
        <el-table-column label="最近提交" width="140">
          <template #default="{ row }">{{ toBJMinute(row.last_submitted_at) }}</template>
        </el-table-column>
        <el-table-column label="最近完成" width="140">
          <template #default="{ row }">{{ toBJMinute(row.last_completed_at) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </PageLayout>
</template>
