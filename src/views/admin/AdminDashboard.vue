<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { MODELS } from '@/types/adapter'
import { DataAnalysis, CircleCheck, CircleClose, Coin, User, Wallet } from '@element-plus/icons-vue'

defineOptions({ name: 'AdminDashboard' })

const activeTab = ref('tasks')

// ─── Shared ───
interface UserOption { id: number; username: string }
const allUsers = ref<UserOption[]>([])

async function loadAllUsers() {
  try {
    const res = await adminApi.listUsers()
    allUsers.value = (res.data.data || []).map((u: any) => ({ id: u.id, username: u.username }))
  } catch { /* ignore */ }
}

// ════════════════════════════════════════════
//  Tab 1: 任务管理
// ════════════════════════════════════════════

interface TaskRow {
  id: number
  username: string
  user_id: number
  toapis_task_id: string
  model: string
  prompt: string
  status: string
  progress: number
  created_at: string
}

const tasks = ref<TaskRow[]>([])
const taskLoading = ref(false)
const taskPage = ref(1)
const taskPageSize = ref(20)
const taskTotal = ref(0)
const taskFilterStatus = ref('')
const taskFilterUserId = ref('')
const taskDateRange = ref<[Date, Date] | null>(null)

const statusMap: Record<string, string> = {
  submitted: '已提交', queued: '排队中', in_progress: '生成中',
  completed: '已完成', failed: '生成失败',
}

async function loadTasks() {
  taskLoading.value = true
  try {
    const params: any = {
      page: taskPage.value,
      pageSize: taskPageSize.value,
      status: taskFilterStatus.value || undefined,
      user_id: taskFilterUserId.value ? Number(taskFilterUserId.value) : undefined,
    }
    if (taskDateRange.value) {
      params.start_date = fmtDate(taskDateRange.value[0])
      params.end_date = fmtDate(taskDateRange.value[1])
    }
    const res = await adminApi.listTasks(params)
    const data = res.data.data
    tasks.value = data.records || []
    taskTotal.value = data.total || 0
  } catch {
    error('加载任务失败')
  } finally {
    taskLoading.value = false
  }
}

async function handleDeleteTask(task: TaskRow) {
  try {
    await confirmDanger({ title: '确认删除', message: '确定删除该任务记录吗？' })
    await adminApi.deleteTask(task.id)
    success('已删除')
    await loadTasks()
  } catch { /* cancelled */ }
}

watch([taskFilterStatus, taskFilterUserId, taskDateRange], () => { taskPage.value = 1; loadTasks() })

// ════════════════════════════════════════════
//  Tab 2: 生成统计
// ════════════════════════════════════════════

interface StatRow {
  user_id: number; username: string; role: string; status: string
  points: number; submitted_count: number; completed_count: number
  failed_count: number; total_cost: number
  last_submitted_at: string | null; last_completed_at: string | null
}

interface DailyRow {
  date: string; total_tasks: number; completed: number
  failed: number; in_progress: number; total_cost: number
}

interface SummaryData {
  total_tasks: number; total_completed: number; total_failed: number
  total_points_consumed: number; active_users: number; total_balance: number
}

const stats = ref<StatRow[]>([])
const dailyStats = ref<DailyRow[]>([])
const summary = ref<SummaryData>({
  total_tasks: 0, total_completed: 0, total_failed: 0,
  total_points_consumed: 0, active_users: 0, total_balance: 0,
})
const statsLoading = ref(false)
const statsDateRange = ref<[Date, Date]>([
  new Date(Date.now() - 30 * 86400000),
  new Date(),
])
const statsUserId = ref<number | null>(null)
const dateShortcuts = [
  { text: '最近7天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 7); return [s, e] } },
  { text: '最近30天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 30); return [s, e] } },
  { text: '最近90天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 90); return [s, e] } },
]

const CHART_COLORS = {
  blue: '#409EFF',
  green: '#67C23A',
  red: '#F56C6C',
  orange: '#E6A23C',
  purple: '#A855F7',
  teal: '#14B8A6',
}

const trendOption = computed(() => ({
  color: [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.red],
  tooltip: {
    trigger: 'axis' as const,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#e5e7eb',
    textStyle: { color: '#374151', fontSize: 13 },
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  legend: { data: ['总任务', '成功', '失败'], bottom: 0, textStyle: { color: '#6b7280' } },
  grid: { left: '3%', right: '4%', bottom: '40px', top: '20px', containLabel: true },
  xAxis: {
    type: 'category' as const,
    data: dailyStats.value.map(d => d.date),
    axisLabel: { rotate: 45, color: '#9ca3af', fontSize: 11 },
    axisLine: { lineStyle: { color: '#e5e7eb' } },
  },
  yAxis: {
    type: 'value' as const,
    minInterval: 1,
    axisLabel: { color: '#9ca3af' },
    splitLine: { lineStyle: { color: '#f3f4f6' } },
  },
  series: [
    {
      name: '总任务', type: 'line', data: dailyStats.value.map(d => d.total_tasks),
      smooth: true, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 3, shadowBlur: 8, shadowColor: 'rgba(64,158,255,0.3)' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: 'rgba(64,158,255,0.12)' }, { offset: 1, color: 'rgba(64,158,255,0)' }] } },
      markPoint: { data: [{ type: 'max', name: '最大' }], symbolSize: 40, label: { fontSize: 10 } },
    },
    {
      name: '成功', type: 'line', data: dailyStats.value.map(d => d.completed),
      smooth: true, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 3, shadowBlur: 8, shadowColor: 'rgba(103,194,58,0.3)' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: 'rgba(103,194,58,0.1)' }, { offset: 1, color: 'rgba(103,194,58,0)' }] } },
    },
    {
      name: '失败', type: 'line', data: dailyStats.value.map(d => d.failed),
      smooth: true, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 2, shadowBlur: 6, shadowColor: 'rgba(245,108,108,0.2)', type: 'dashed' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: 'rgba(245,108,108,0.08)' }, { offset: 1, color: 'rgba(245,108,108,0)' }] } },
    },
  ],
}))

const pieOption = computed(() => ({
  color: [CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.orange],
  tooltip: {
    trigger: 'item' as const,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#e5e7eb',
    textStyle: { color: '#374151' },
    formatter: '{b}: {c} ({d}%)' as any,
  },
  legend: { bottom: 0, textStyle: { color: '#6b7280' } },
  graphic: [
    { type: 'text', left: 'center', top: '38%',
      style: { text: `${summary.value.total_tasks}`, textAlign: 'center',
        fill: '#374151', fontSize: 22, fontWeight: 700 } },
    { type: 'text', left: 'center', top: '50%',
      style: { text: '总任务', textAlign: 'center', fill: '#9ca3af', fontSize: 12 } },
  ],
  series: [{
    name: '任务分布', type: 'pie',
    radius: ['55%', '78%'],
    center: ['50%', '45%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 3 },
    label: { show: false },
    emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
    data: [
      { value: summary.value.total_completed, name: '成功' },
      { value: summary.value.total_failed, name: '失败' },
      { value: summary.value.total_tasks - summary.value.total_completed - summary.value.total_failed, name: '进行中' },
    ],
  }],
}))

const barOption = computed(() => ({
  color: [CHART_COLORS.green, CHART_COLORS.red],
  tooltip: {
    trigger: 'axis' as const,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#e5e7eb',
    textStyle: { color: '#374151' },
  },
  legend: { data: ['成功', '失败'], bottom: 0, textStyle: { color: '#6b7280' } },
  grid: { left: '3%', right: '4%', bottom: '40px', top: '10px', containLabel: true },
  xAxis: {
    type: 'category' as const, data: stats.value.map(s => s.username),
    axisLabel: { rotate: 30, color: '#9ca3af' },
    axisLine: { lineStyle: { color: '#e5e7eb' } },
  },
  yAxis: {
    type: 'value' as const, minInterval: 1,
    axisLabel: { color: '#9ca3af' },
    splitLine: { lineStyle: { color: '#f3f4f6' } },
  },
  series: [
    {
      name: '成功', type: 'bar', data: stats.value.map(s => s.completed_count),
      stack: 'x', barWidth: '50%',
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' } },
    },
    {
      name: '失败', type: 'bar', data: stats.value.map(s => s.failed_count),
      stack: 'x',
      itemStyle: { borderRadius: [0, 0, 0, 0] },
    },
  ],
}))

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10) }

async function loadStats() {
  statsLoading.value = true
  try {
    const startDate = fmtDate(statsDateRange.value[0])
    const endDate = fmtDate(statsDateRange.value[1])
    const [statsRes, dailyRes, summaryRes] = await Promise.all([
      adminApi.getStats(),
      adminApi.getDailyStats({
        start_date: startDate,
        end_date: endDate,
        user_id: statsUserId.value || undefined,
      }),
      adminApi.getStatsSummary(),
    ])
    stats.value = statsRes.data.data || []
    dailyStats.value = dailyRes.data.data || []
    summary.value = summaryRes.data.data || summary.value
  } catch {
    error('加载统计失败')
  } finally {
    statsLoading.value = false
  }
}

function handleStatsSearch() { loadStats() }

// ════════════════════════════════════════════
//  Tab 3: 积分流水
// ════════════════════════════════════════════

interface TxnRow {
  id: number; user_id: number; username: string; amount: number
  balance_after: number; reason: string; reference_type: string | null
  reference_id: number | null; operator_name: string; note: string; created_at: string
}

const txnRecords = ref<TxnRow[]>([])
const txnTotal = ref(0)
const txnPage = ref(1)
const txnPageSize = ref(20)
const txnLoading = ref(false)
const txnFilterUserId = ref('')
const txnFilterReason = ref('')
const txnFilterStartDate = ref('')
const txnFilterEndDate = ref('')

const reasonLabel: Record<string, string> = {
  generation: '生成消耗', admin_recharge: '管理员充值', admin_deduct: '管理员扣减',
}

async function loadTransactions() {
  txnLoading.value = true
  try {
    const params: any = { page: txnPage.value, pageSize: txnPageSize.value }
    if (txnFilterUserId.value) params.user_id = Number(txnFilterUserId.value)
    if (txnFilterReason.value) params.reason = txnFilterReason.value
    if (txnFilterStartDate.value) params.start_date = txnFilterStartDate.value
    if (txnFilterEndDate.value) params.end_date = txnFilterEndDate.value
    const res = await adminApi.listTransactions(params)
    txnRecords.value = res.data.data?.records || []
    txnTotal.value = res.data.data?.total || 0
  } catch {
    error('加载交易记录失败')
  } finally {
    txnLoading.value = false
  }
}

function handleTxnPageChange(p: number) { txnPage.value = p; loadTransactions() }
function handleTxnSearch() { txnPage.value = 1; loadTransactions() }

// ─── Lifecycle ───
onMounted(async () => {
  await loadAllUsers()
  loadTasks()
})

const tabLabel = computed(() => {
  const m: Record<string, string> = { tasks: '任务管理', stats: '生成统计', transactions: '积分流水' }
  return m[activeTab.value] || ''
})
</script>

<template>
  <PageLayout>
    <template #header><h2>生图日志</h2></template>

    <el-tabs v-model="activeTab" @tab-change="(t: string) => {
      if (t === 'stats') loadStats()
      else if (t === 'transactions' && txnRecords.length === 0) loadTransactions()
      else if (t === 'tasks' && tasks.length === 0) loadTasks()
    }">
      <!-- ═══ Tab 1: 任务管理 ═══ -->
      <el-tab-pane label="任务管理" name="tasks">
        <div class="tab-filters">
          <el-date-picker
            v-model="taskDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :shortcuts="dateShortcuts"
            value-format="YYYY-MM-DD"
            style="width:280px"
          />
          <el-select v-model="taskFilterStatus" placeholder="状态筛选" clearable size="default" style="width:140px">
            <el-option v-for="(label, key) in statusMap" :key="key" :label="label" :value="key" />
          </el-select>
          <el-input v-model="taskFilterUserId" placeholder="用户ID" clearable size="default" style="width:140px" />
          <el-button @click="loadTasks">刷新</el-button>
        </div>

        <el-table :data="tasks" v-loading="taskLoading" stripe>
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="username" label="用户" width="100" />
          <el-table-column prop="toapis_task_id" label="ToAPIs ID" width="200" show-overflow-tooltip />
          <el-table-column label="模型" width="160">
            <template #default="{ row }">
              {{ MODELS.find(m => m.id === row.model)?.name || row.model }}
            </template>
          </el-table-column>
          <el-table-column prop="prompt" label="提示词" min-width="180" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag
                :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'info'"
                size="small"
              >
                {{ statusMap[row.status] || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="提交时间" width="150">
            <template #default="{ row }">{{ row.created_at?.slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-popconfirm title="确定删除？" @confirm="handleDeleteTask(row)">
                <template #reference>
                  <el-button type="danger" size="small" plain>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="taskTotal > taskPageSize" class="pagination-wrap">
          <el-pagination
            v-model:current-page="taskPage" :page-size="taskPageSize" :total="taskTotal"
            layout="prev, pager, next, total" @current-change="loadTasks"
          />
        </div>
      </el-tab-pane>

      <!-- ═══ Tab 2: 生成统计 ═══ -->
      <el-tab-pane label="生成统计" name="stats">
        <!-- Controls -->
        <div class="stats-controls">
          <el-date-picker
            v-model="statsDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :shortcuts="dateShortcuts"
            value-format="YYYY-MM-DD"
            style="width:280px"
          />
          <el-select v-model="statsUserId" placeholder="全部用户" clearable style="width:180px">
            <el-option v-for="u in allUsers" :key="u.id" :label="u.username" :value="u.id" />
          </el-select>
          <el-button type="primary" @click="handleStatsSearch">查询</el-button>
        </div>

        <div v-loading="statsLoading">
          <!-- Summary Cards -->
          <div class="summary-cards">
            <div class="summary-card">
              <div class="sc-icon" style="background:var(--el-color-primary-light-9)"><el-icon size="22" color="var(--el-color-primary)"><DataAnalysis /></el-icon></div>
              <div class="sc-body"><div class="sc-value">{{ summary.total_tasks }}</div><div class="sc-label">总提交</div></div>
            </div>
            <div class="summary-card">
              <div class="sc-icon" style="background:var(--el-color-success-light-9)"><el-icon size="22" color="var(--el-color-success)"><CircleCheck /></el-icon></div>
              <div class="sc-body"><div class="sc-value sc-success">{{ summary.total_completed }}</div><div class="sc-label">总成功</div></div>
            </div>
            <div class="summary-card">
              <div class="sc-icon" style="background:var(--el-color-danger-light-9)"><el-icon size="22" color="var(--el-color-danger)"><CircleClose /></el-icon></div>
              <div class="sc-body"><div class="sc-value sc-danger">{{ summary.total_failed }}</div><div class="sc-label">总失败</div></div>
            </div>
            <div class="summary-card">
              <div class="sc-icon" style="background:var(--el-color-warning-light-9)"><el-icon size="22" color="var(--el-color-warning)"><Coin /></el-icon></div>
              <div class="sc-body"><div class="sc-value">{{ summary.total_points_consumed.toFixed(1) }}</div><div class="sc-label">积分消耗</div></div>
            </div>
            <div class="summary-card">
              <div class="sc-icon" style="background:#f3e8ff"><el-icon size="22" color="#A855F7"><User /></el-icon></div>
              <div class="sc-body"><div class="sc-value">{{ summary.active_users }}</div><div class="sc-label">活跃用户</div></div>
            </div>
            <div class="summary-card">
              <div class="sc-icon" style="background:#ccfbf1"><el-icon size="22" color="#14B8A6"><Wallet /></el-icon></div>
              <div class="sc-body"><div class="sc-value">{{ summary.total_balance.toFixed(1) }}</div><div class="sc-label">总余额</div></div>
            </div>
          </div>

          <!-- Charts Row -->
          <el-row :gutter="16" style="margin-bottom:20px">
            <el-col :span="16">
              <div class="chart-card">
                <div class="chart-card-header">每日生成趋势</div>
                <VChart :option="trendOption" style="height:340px" autoresize />
              </div>
            </el-col>
            <el-col :span="8">
              <div class="chart-card">
                <div class="chart-card-header">任务占比</div>
                <VChart :option="pieOption" style="height:340px" autoresize />
              </div>
            </el-col>
          </el-row>

          <!-- Bar chart -->
          <div class="chart-card" style="margin-bottom:20px">
            <div class="chart-card-header">用户生成统计</div>
            <VChart v-if="stats.length > 0" :option="barOption" style="height:320px" autoresize />
            <el-empty v-else description="暂无数据" />
          </div>

          <!-- User stats table -->
          <div class="chart-card">
            <div class="chart-card-header">用户明细</div>
            <el-table :data="stats" stripe size="small">
              <el-table-column prop="username" label="用户名" />
              <el-table-column label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
                    {{ row.status === 'active' ? '正常' : '禁用' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="积分" width="100">
                <template #default="{ row }"><span :style="{ color: row.points <= 0 ? 'var(--el-color-danger)' : 'inherit' }">{{ row.points }}</span></template>
              </el-table-column>
              <el-table-column label="提交" prop="submitted_count" sortable width="80" />
              <el-table-column label="成功" prop="completed_count" sortable width="80" />
              <el-table-column label="失败" prop="failed_count" sortable width="80" />
              <el-table-column label="积分消耗" prop="total_cost" sortable width="100" />
              <el-table-column label="最近提交" width="140">
                <template #default="{ row }">{{ row.last_submitted_at?.slice(0, 16) || '-' }}</template>
              </el-table-column>
              <el-table-column label="最近完成" width="140">
                <template #default="{ row }">{{ row.last_completed_at?.slice(0, 16) || '-' }}</template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <!-- ═══ Tab 3: 积分流水 ═══ -->
      <el-tab-pane label="积分流水" name="transactions">
        <div class="tab-filters">
          <el-input v-model="txnFilterUserId" placeholder="用户ID" clearable style="width:130px" />
          <el-select v-model="txnFilterReason" placeholder="原因" clearable style="width:150px">
            <el-option label="生成消耗" value="generation" />
            <el-option label="管理员充值" value="admin_recharge" />
            <el-option label="管理员扣减" value="admin_deduct" />
          </el-select>
          <el-date-picker v-model="txnFilterStartDate" type="date" placeholder="开始日期" value-format="YYYY-MM-DD" style="width:160px" />
          <el-date-picker v-model="txnFilterEndDate" type="date" placeholder="结束日期" value-format="YYYY-MM-DD" style="width:160px" />
          <el-button type="primary" @click="handleTxnSearch">查询</el-button>
        </div>

        <el-table :data="txnRecords" v-loading="txnLoading" stripe>
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="username" label="用户" width="120" />
          <el-table-column label="金额" width="120">
            <template #default="{ row }">
              <span :style="{ color: row.amount >= 0 ? 'var(--el-color-success)' : 'var(--el-color-danger)', fontWeight: 600 }">
                {{ row.amount >= 0 ? '+' : '' }}{{ row.amount }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="变动后余额" width="120">
            <template #default="{ row }">{{ row.balance_after }}</template>
          </el-table-column>
          <el-table-column label="原因" width="120">
            <template #default="{ row }">{{ reasonLabel[row.reason] || row.reason }}</template>
          </el-table-column>
          <el-table-column label="操作人" width="100">
            <template #default="{ row }">{{ row.operator_name || '系统' }}</template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="120" />
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ row.created_at?.slice(0, 19) }}</template>
          </el-table-column>
        </el-table>

        <div v-if="txnTotal > txnPageSize" class="pagination-wrap">
          <el-pagination
            v-model:current-page="txnPage" :page-size="txnPageSize" :total="txnTotal"
            layout="prev, pager, next, total" @current-change="handleTxnPageChange"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </PageLayout>
</template>

<style scoped>
.tab-filters {
  display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center;
}

.pagination-wrap {
  margin-top: 16px; display: flex; justify-content: center;
}

/* ── Stats controls ── */
.stats-controls {
  display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;
}

/* ── Summary cards ── */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.summary-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 18px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: box-shadow 0.2s;
}
.summary-card:hover {
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

.sc-icon {
  width: 44px; height: 44px;
  border-radius: var(--momo-radius-md);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.sc-body { min-width: 0; }
.sc-value {
  font-size: 22px; font-weight: 700; color: var(--el-text-color-primary); line-height: 1.2;
}
.sc-success { color: var(--el-color-success); }
.sc-danger { color: var(--el-color-danger); }
.sc-label {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-placeholder); margin-top: 2px;
}

/* ── Chart cards ── */
.chart-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 20px;
}
.chart-card-header {
  font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); margin-bottom: 12px;
}

@media (max-width: 1200px) {
  .summary-cards { grid-template-columns: repeat(3, 1fr); }
}
</style>
