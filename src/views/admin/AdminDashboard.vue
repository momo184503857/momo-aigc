<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { toBJMinute, toBJDate } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { formatCredits, creditsToYuan } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'

const modelCatalog = useModelCatalogStore()
import { CHART_COLORS, CHART_NEUTRALS, tooltipBase, withAlpha } from '@/plugins/echartsPalette'

defineOptions({ name: 'AdminDashboard' })

const activeTab = ref('activity')

// ─── Shared ───
interface UserOption { id: number; username: string }
const allUsers = ref<UserOption[]>([])

async function loadAllUsers() {
  try {
    const res = await adminApi.listUsers()
    allUsers.value = (res.data.data || []).map((u: any) => ({ id: u.id, username: u.username }))
  } catch { /* ignore */ }
}

// el-date-picker 设了 value-format="YYYY-MM-DD"：选过日期后 v-model 会变成字符串，
// 初始值仍是 Date 对象，两种都要兼容，否则选日期后点击查询会抛 TypeError。
function fmtDate(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : toBJDate(d.toISOString())
}

const dateShortcuts = [
  { text: '最近7天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 7); return [s, e] } },
  { text: '最近30天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 30); return [s, e] } },
  { text: '最近90天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 90); return [s, e] } },
]

const statusMap: Record<string, string> = {
  submitted: '已提交', queued: '排队中', in_progress: '生成中',
  completed: '已完成', failed: '生成失败',
}

const reasonLabel: Record<string, string> = {
  generation: '生成消耗', admin_recharge: '管理员充值', admin_deduct: '管理员扣减', refund: '失败退款',
}

// ════════════════════════════════════════════
//  Tab 1: 任务与积分（统一活动日志）
// ════════════════════════════════════════════

interface ActivityRow {
  type: 'task' | 'txn'
  id: number
  task_no: string | null
  toapis_task_id?: string | null
  provider_code?: string | null
  user_id: number
  username: string
  model: string | null
  prompt: string | null
  status: string | null
  amount: number
  balance_after: number | null
  reason: string
  operator_name: string
  note: string
  created_at: string
}

const activity = ref<ActivityRow[]>([])
const activityLoading = ref(false)
const activityPage = ref(1)
const activityPageSize = ref(20)
const activityTotal = ref(0)
const actFilterType = ref('')
const actFilterStatus = ref('')
const actFilterUser = ref('')
const actFilterTaskId = ref('')
const actDateRange = ref<[Date, Date] | null>(null)

async function loadActivity() {
  activityLoading.value = true
  try {
    const params: any = {
      page: activityPage.value,
      pageSize: activityPageSize.value,
      type: actFilterType.value || undefined,
      status: actFilterStatus.value || undefined,
      user: actFilterUser.value.trim() || undefined,
      task_id: actFilterTaskId.value.trim() || undefined,
    }
    if (actDateRange.value) {
      params.start_date = fmtDate(actDateRange.value[0])
      params.end_date = fmtDate(actDateRange.value[1])
    }
    const res = await adminApi.listActivity(params)
    const data = res.data.data
    activity.value = data.records || []
    activityTotal.value = data.total || 0
  } catch {
    error('加载日志失败')
  } finally {
    activityLoading.value = false
  }
}

function activityRowKey(row: ActivityRow) {
  return `${row.type}-${row.id}`
}

async function handleDeleteActivity(row: ActivityRow) {
  try {
    await confirmDanger({ title: '确认删除', message: '确定删除该任务记录吗？' })
    await adminApi.deleteTask(row.id)
    success('已删除')
    await loadActivity()
  } catch { /* cancelled */ }
}

watch([actFilterType, actFilterStatus, actFilterUser, actFilterTaskId, actDateRange], () => {
  activityPage.value = 1
  loadActivity()
})

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
// 是否已激活过「生成统计」tab：避免图表在 tab 隐藏(display:none)状态下 init，
// 否则 echarts.init 时 clientHeight=0 会打印 DOM 尺寸警告。
const statsActivated = ref(false)
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
// 统计维度：次数 / 金额（同时驱动趋势图与柱状图）；周期：日/周/月（驱动趋势图分桶）
const statsMetric = ref<'count' | 'cost'>('cost')
const statsGranularity = ref<'day' | 'week' | 'month'>('day')

const trendTitle = computed(() => {
  const period = statsGranularity.value === 'month' ? '每月' : statsGranularity.value === 'week' ? '每周' : '每日'
  return statsMetric.value === 'cost' ? `${period}消耗金额` : `${period}生成趋势`
})

const trendOption = computed(() => {
  const grid = { left: '3%', right: '4%', bottom: '40px', top: '20px', containLabel: true }
  const xAxis = {
    type: 'category' as const,
    data: dailyStats.value.map(d => d.date),
    axisLabel: { rotate: 45, color: CHART_NEUTRALS.textTertiary, fontSize: 11 },
    axisLine: { lineStyle: { color: CHART_NEUTRALS.axisLine } },
  }

  // 金额：消耗金额（¥）随时间
  if (statsMetric.value === 'cost') {
    return {
      color: [CHART_COLORS.orange],
      tooltip: { ...tooltipBase, formatter: (p: any) => {
        const credits = dailyStats.value[p[0].dataIndex]?.total_cost ?? 0
        return `${p[0].axisValue}<br/>消耗 ${formatCredits(credits, { creditDigits: 1, yuanDigits: 2 })}`
      } },
      grid,
      xAxis,
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `¥${v.toFixed(0)}`, color: CHART_NEUTRALS.textTertiary },
        splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
      },
      series: [{
        name: '消耗金额', type: 'line',
        data: dailyStats.value.map(d => creditsToYuan(d.total_cost)),
        smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 3, shadowBlur: 8, shadowColor: withAlpha(CHART_COLORS.orange, 0.3) },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: withAlpha(CHART_COLORS.orange, 0.18) }, { offset: 1, color: withAlpha(CHART_COLORS.orange, 0) }] } },
        markPoint: { data: [{ type: 'max', name: '最大' }], symbolSize: 40, label: { fontSize: 10 } },
      }],
    }
  }

  // 次数：总任务/成功/失败
  return {
    color: [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.red],
    tooltip: { ...tooltipBase, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
    legend: { data: ['总任务', '成功', '失败'], bottom: 0, textStyle: { color: CHART_NEUTRALS.textSecondary } },
    grid,
    xAxis,
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { color: CHART_NEUTRALS.textTertiary },
      splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
    },
    series: [
      {
        name: '总任务', type: 'line', data: dailyStats.value.map(d => d.total_tasks),
        smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 3, shadowBlur: 8, shadowColor: withAlpha(CHART_COLORS.blue, 0.3) },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: withAlpha(CHART_COLORS.blue, 0.12) }, { offset: 1, color: withAlpha(CHART_COLORS.blue, 0) }] } },
        markPoint: { data: [{ type: 'max', name: '最大' }], symbolSize: 40, label: { fontSize: 10 } },
      },
      {
        name: '成功', type: 'line', data: dailyStats.value.map(d => d.completed),
        smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 3, shadowBlur: 8, shadowColor: withAlpha(CHART_COLORS.green, 0.3) },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: withAlpha(CHART_COLORS.green, 0.1) }, { offset: 1, color: withAlpha(CHART_COLORS.green, 0) }] } },
      },
      {
        name: '失败', type: 'line', data: dailyStats.value.map(d => d.failed),
        smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2, shadowBlur: 6, shadowColor: withAlpha(CHART_COLORS.red, 0.2), type: 'dashed' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: withAlpha(CHART_COLORS.red, 0.08) }, { offset: 1, color: withAlpha(CHART_COLORS.red, 0) }] } },
      },
    ],
  }
})

const pieOption = computed(() => ({
  color: [CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.orange],
  tooltip: {
    trigger: 'item' as const,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: CHART_NEUTRALS.tooltipBorder,
    textStyle: { color: CHART_NEUTRALS.textPrimary },
    formatter: '{b}: {c} ({d}%)' as any,
  },
  legend: { bottom: 0, textStyle: { color: CHART_NEUTRALS.textSecondary } },
  graphic: [
    { type: 'text', left: 'center', top: '38%',
      style: { text: `${summary.value.total_tasks}`, textAlign: 'center',
        fill: CHART_NEUTRALS.textPrimary, fontSize: 22, fontWeight: 700 } },
    { type: 'text', left: 'center', top: '50%',
      style: { text: '总任务', textAlign: 'center', fill: CHART_NEUTRALS.textTertiary, fontSize: 12 } },
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

const barTitle = computed(() => statsMetric.value === 'cost' ? '用户消耗金额' : '用户生成统计')

const barOption = computed(() => {
  const grid = { left: '3%', right: '4%', bottom: '40px', top: '10px', containLabel: true }
  const axisLine = { lineStyle: { color: CHART_NEUTRALS.axisLine } }

  // 金额：每个用户的消耗金额（¥），按消耗降序
  if (statsMetric.value === 'cost') {
    const sorted = [...stats.value].sort((a, b) => b.total_cost - a.total_cost)
    return {
      color: [CHART_COLORS.orange],
      tooltip: { ...tooltipBase, formatter: (p: any) => {
        const credits = sorted[p[0].dataIndex]?.total_cost ?? 0
        return `${p[0].name}<br/>消耗 ${formatCredits(credits, { creditDigits: 1, yuanDigits: 2 })}`
      } },
      grid,
      xAxis: {
        type: 'category' as const, data: sorted.map(s => s.username),
        axisLabel: { rotate: 30, color: CHART_NEUTRALS.textTertiary }, axisLine,
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `¥${v.toFixed(0)}`, color: CHART_NEUTRALS.textTertiary },
        splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
      },
      series: [{
        name: '消耗金额', type: 'bar',
        data: sorted.map(s => creditsToYuan(s.total_cost)),
        barWidth: '50%',
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)' } },
      }],
    }
  }

  // 次数：成功/失败堆叠
  return {
    color: [CHART_COLORS.green, CHART_COLORS.red],
    tooltip: tooltipBase,
    legend: { data: ['成功', '失败'], bottom: 0, textStyle: { color: CHART_NEUTRALS.textSecondary } },
    grid,
    xAxis: {
      type: 'category' as const, data: stats.value.map(s => s.username),
      axisLabel: { rotate: 30, color: CHART_NEUTRALS.textTertiary }, axisLine,
    },
    yAxis: {
      type: 'value' as const, minInterval: 1,
      axisLabel: { color: CHART_NEUTRALS.textTertiary },
      splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
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
  }
})

async function loadStats() {
  statsLoading.value = true
  try {
    const params = {
      start_date: fmtDate(statsDateRange.value[0]),
      end_date: fmtDate(statsDateRange.value[1]),
      user_id: statsUserId.value || undefined,
      granularity: statsGranularity.value,
    }
    const [statsRes, dailyRes, summaryRes] = await Promise.all([
      adminApi.getStats(params),
      adminApi.getDailyStats(params),
      adminApi.getStatsSummary(params),
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

// 周期切换需重新分桶（金额/次数是前端切换，无需请求）
watch(statsGranularity, () => loadStats())

function handleTabChange(t: string) {
  if (t === 'stats') {
    // nextTick：先让 el-tabs 把面板从 display:none 切回可见，再挂载图表，
    // 否则 echarts.init 会在 0 尺寸容器上打印 "Can't get DOM width or height"。
    nextTick(() => { statsActivated.value = true })
    loadStats()
  } else if (t === 'activity' && activity.value.length === 0) {
    loadActivity()
  }
}

// ─── Lifecycle ───
onMounted(async () => {
  await loadAllUsers()
  loadActivity()
})
</script>

<template>
  <PageLayout>
    <template #header><h2>生图日志</h2></template>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- ═══ Tab 1: 任务与积分（统一活动日志）═══ -->
      <el-tab-pane label="任务与积分" name="activity">
        <div class="tab-filters">
          <el-input v-model="actFilterUser" placeholder="用户名/昵称/邮箱" clearable size="default" style="width:180px" />
          <el-input v-model="actFilterTaskId" placeholder="任务号（gen-xxx，兼容旧渠道号）" clearable size="default" style="width:200px" />
          <el-date-picker
            v-model="actDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :shortcuts="dateShortcuts"
            value-format="YYYY-MM-DD"
            style="width:220px"
          />
          <el-select v-model="actFilterType" placeholder="类型" clearable size="default" style="width:130px">
            <el-option label="生成" value="task" />
            <el-option label="充值/扣减" value="txn" />
          </el-select>
          <el-select v-model="actFilterStatus" placeholder="状态筛选" clearable size="default" style="width:130px">
            <el-option v-for="(label, key) in statusMap" :key="key" :label="label" :value="key" />
          </el-select>
          <el-button @click="loadActivity">刷新</el-button>
        </div>

        <el-table
          :data="activity"
          v-loading="activityLoading"
          stripe
          :row-key="activityRowKey"
        >
          <el-table-column label="任务ID" width="200" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.type === 'task' ? (row.task_no || row.toapis_task_id || '-') : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="类型" width="96">
            <template #default="{ row }">
              <el-tag
                :type="row.type === 'task' ? 'primary' : row.amount >= 0 ? 'success' : 'danger'"
                size="small"
                effect="light"
              >
                {{ row.type === 'task' ? '生成' : (reasonLabel[row.reason] || row.reason) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="username" label="用户" width="100" />
          <el-table-column label="模型" width="140">
            <template #default="{ row }">
              {{ row.model ? modelCatalog.displayNameFor(row.model) : '—' }}
            </template>
          </el-table-column>
          <el-table-column label="详情" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.type === 'task' ? (row.prompt || '—') : (row.note || '—') }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag
                v-if="row.type === 'task'"
                :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'info'"
                size="small"
              >
                {{ statusMap[row.status] || row.status }}
              </el-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="积分变动" width="120">
            <template #default="{ row }">
              <span :style="{ color: row.amount >= 0 ? 'var(--el-color-success)' : 'var(--el-color-danger)', fontWeight: 600 }">
                {{ row.amount >= 0 ? '+' : '' }}{{ formatCredits(row.amount, { creditsOnly: true }) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="余额" width="150">
            <template #default="{ row }">
              {{ row.balance_after == null ? '—' : formatCredits(row.balance_after, { creditDigits: 0, yuanDigits: 2 }) }}
            </template>
          </el-table-column>
          <el-table-column label="操作人" width="100">
            <template #default="{ row }">{{ row.type === 'task' ? '—' : (row.operator_name || '系统') }}</template>
          </el-table-column>
          <el-table-column label="时间" width="150">
            <template #default="{ row }">{{ toBJMinute(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-popconfirm v-if="row.type === 'task'" title="确定删除？" @confirm="handleDeleteActivity(row)">
                <template #reference>
                  <el-button type="danger" size="small" plain>删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="activityTotal > activityPageSize" class="pagination-wrap">
          <el-pagination
            v-model:current-page="activityPage" :page-size="activityPageSize" :total="activityTotal"
            layout="prev, pager, next, total" @current-change="loadActivity"
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

        <!-- 维度（次数/金额）+ 周期（日/周/月）：金额切换为前端重渲染，周期切换重新分桶 -->
        <div class="stats-toolbar">
          <el-radio-group v-model="statsMetric" size="small">
            <el-radio-button value="count">次数</el-radio-button>
            <el-radio-button value="cost">金额</el-radio-button>
          </el-radio-group>
          <el-radio-group v-model="statsGranularity" size="small">
            <el-radio-button value="day">日</el-radio-button>
            <el-radio-button value="week">周</el-radio-button>
            <el-radio-button value="month">月</el-radio-button>
          </el-radio-group>
        </div>

        <div v-loading="statsLoading">
          <el-row :gutter="16">
            <!-- 左：趋势 + 用户柱状 -->
            <el-col :md="17" :xs="24">
              <div class="chart-card" style="margin-bottom:16px">
                <div class="chart-card-header">{{ trendTitle }}</div>
                <VChart v-if="statsActivated" :option="trendOption" style="height:340px" autoresize />
              </div>
              <div class="chart-card">
                <div class="chart-card-header">{{ barTitle }}</div>
                <!-- 仅在 stats tab 首次激活后渲染图表，避免在 display:none 容器中 init 导致 DOM 尺寸警告。 -->
                <VChart v-if="statsActivated" :option="barOption" style="height:320px" autoresize />
                <el-empty v-if="stats.length === 0" description="暂无数据" />
              </div>
            </el-col>

            <!-- 右：KPI + 占比环形 -->
            <el-col :md="7" :xs="24">
              <div class="chart-card" style="margin-bottom:16px">
                <div class="chart-card-header">数据概览</div>
                <div class="kpi-list">
                  <div class="kpi-item">
                    <span class="kpi-label">总提交</span>
                    <span class="kpi-value">{{ summary.total_tasks }}</span>
                  </div>
                  <div class="kpi-item">
                    <span class="kpi-label">总成功</span>
                    <span class="kpi-value kpi-success">{{ summary.total_completed }}</span>
                  </div>
                  <div class="kpi-item">
                    <span class="kpi-label">总失败</span>
                    <span class="kpi-value kpi-danger">{{ summary.total_failed }}</span>
                  </div>
                  <div class="kpi-item">
                    <span class="kpi-label">积分消耗</span>
                    <span class="kpi-value">{{ formatCredits(summary.total_points_consumed, { creditDigits: 0, yuanDigits: 2 }) }}</span>
                  </div>
                </div>
              </div>
              <div class="chart-card">
                <div class="chart-card-header">任务占比</div>
                <VChart v-if="statsActivated" :option="pieOption" style="height:280px" autoresize />
              </div>
            </el-col>
          </el-row>

          <!-- 用户明细 -->
          <div class="chart-card" style="margin-top:16px">
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
              <el-table-column label="积分" width="170">
                <template #default="{ row }"><span :style="{ color: row.points <= 0 ? 'var(--el-color-danger)' : 'inherit' }">{{ formatCredits(row.points, { creditDigits: 0, yuanDigits: 2 }) }}</span></template>
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

/* ── 维度/周期切换条 ── */
.stats-toolbar {
  display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center;
}

/* ── KPI list（右侧栏，纯文字降噪）── */
.kpi-list {
  display: flex; flex-direction: column;
}
.kpi-item {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.kpi-item:last-child { border-bottom: none; }
.kpi-value {
  font-size: 22px; font-weight: 700; color: var(--el-text-color-primary); line-height: 1.2;
}
.kpi-success { color: var(--el-color-success); }
.kpi-danger { color: var(--el-color-danger); }
.kpi-label {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-placeholder);
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
</style>
