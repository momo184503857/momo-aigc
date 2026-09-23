<script setup lang="ts">
/**
 * AdminDashboard — 生图日志 / 统计看板
 *
 * 信息架构（第四版重排）：
 * 1. 页头两行固定：第一行「标题 + 视图分段」，第二行「当前视图的全部筛选」。
 * 2. 主体顶部是一条跨视图常驻的 KPI 带（吸顶），数据口径来自 getStatsSummary，
 *    失败格可一键把流水筛到 failed —— 「先读量级、再钻个案」是一条路径。
 * 3. 任务与积分视图：宽表压到 7 列，全量字段与删除动作收进右侧详情抽屉；
 *    表格是主体唯一纵向滚动区，表头与操作列吸边，分页钉在页脚。
 * 4. 生成统计视图：按「量-趋势 / 谁-排行 / 构成-占比 / 明细-表」四问排列，
 *    图表只在视图首次打开且容器有真实高度后挂载（statsActivated）。
 */
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChartBar,
  ChartPie,
  CircleAlert,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  X,
} from '@lucide/vue'
import { toBJMinute, toBJDate } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error, confirmDanger } = useUiFeedback()
import { useClientSort } from '@/composables/useClientSort'
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { formatCredits } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'

const modelCatalog = useModelCatalogStore()
import { CHART_COLORS, CHART_NEUTRALS, tooltipBase, withAlpha } from '@/plugins/echartsPalette'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UiDateRangePicker, UiEmptyState, UiPagination } from '@/components/ui'

defineOptions({ name: 'AdminDashboard' })

const activeTab = ref('activity')

// 两个视图共用页头的分段控件切换；'activity' = 任务与积分流水，'stats' = 生成统计
const isLog = computed(() => activeTab.value === 'activity')

// ─── Shared ───
interface UserOption { id: number; username: string }
const allUsers = ref<UserOption[]>([])

async function loadAllUsers() {
  try {
    // 仅用作用户 id → 用户名映射，pageSize 取接口上限内的大值一次拉全
    const res = await adminApi.listUsers({ page: 1, pageSize: 1000 })
    allUsers.value = (res.data.data.list || []).map((u: any) => ({ id: u.id, username: u.username }))
  } catch { /* ignore */ }
}

// 日期范围选择器 value-format="YYYY-MM-DD"：选过日期后 v-model 会变成字符串，
// 初始值仍是 Date 对象，两种都要兼容，否则选日期后点击查询会抛 TypeError。
function fmtDate(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : toBJDate(d.toISOString())
}

const dateShortcuts = [
  { text: '最近7天', value: (): [Date, Date] => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 7); return [s, e] } },
  { text: '最近30天', value: (): [Date, Date] => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 30); return [s, e] } },
  { text: '最近90天', value: (): [Date, Date] => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 90); return [s, e] } },
]

const statusMap: Record<string, string> = {
  submitted: '已提交', queued: '排队中', in_progress: '生成中',
  completed: '已完成', failed: '生成失败',
}

const reasonLabel: Record<string, string> = {
  generation: '生成消耗', admin_recharge: '管理员充值', admin_deduct: '管理员扣减', refund: '失败退款',
}

// reka SelectItem 不接受空字符串 value，用哨兵值表示「全部」（替代原 clearable）
const ALL = '__all__'

// ════════════════════════════════════════════
//  视图 1: 任务与积分（统一活动日志）
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

// ─── 流水筛选的派生显示态（纯视图内）───
const logFilterDirty = computed(
  () => !!(actFilterUser.value || actFilterTaskId.value || actFilterType.value
    || actFilterStatus.value || actDateRange.value),
)

/** 一次清空全部流水条件；多个 ref 同帧变更，watch 只会合并成一次重查 */
function clearLogFilters() {
  actFilterUser.value = ''
  actFilterTaskId.value = ''
  actFilterType.value = ''
  actFilterStatus.value = ''
  actDateRange.value = null
}

function toggleFailedOnly() {
  actFilterStatus.value = actFilterStatus.value === 'failed' ? '' : 'failed'
}

const showLogPagination = computed(
  () => isLog.value && activityTotal.value > activityPageSize.value,
)

// ─── 详情抽屉：表格只留关键字段，其余全量字段与删除动作收在这里 ───
const detailOpen = ref(false)
const detailRow = ref<ActivityRow | null>(null)

function openDetail(row: ActivityRow) {
  detailRow.value = row
  detailOpen.value = true
}

async function deleteFromDetail() {
  const row = detailRow.value
  if (!row) return
  await handleDeleteActivity(row)
  // 删除成功才会重拉列表；在确认框里取消时记录仍在，抽屉保持打开
  if (!activity.value.some((r) => r.type === row.type && r.id === row.id)) detailOpen.value = false
}

// ════════════════════════════════════════════
//  视图 2: 生成统计
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

interface StatColumn {
  key?: string
  label: string
  cls?: string
  sortable?: boolean
}

const statColumns: StatColumn[] = [
  { key: 'username', label: '用户名', sortable: true },
  { label: '状态', cls: 'w-[80px]' },
  { key: 'points', label: '积分', cls: 'w-[170px]', sortable: true },
  { key: 'submitted_count', label: '提交', cls: 'w-[80px]', sortable: true },
  { key: 'completed_count', label: '成功', cls: 'w-[80px]', sortable: true },
  { key: 'failed_count', label: '失败', cls: 'w-[80px]', sortable: true },
  { key: 'total_cost', label: '积分消耗', cls: 'w-[170px]', sortable: true },
  { key: 'last_submitted_at', label: '最近提交', cls: 'w-[140px]', sortable: true },
  { key: 'last_completed_at', label: '最近完成', cls: 'w-[140px]', sortable: true },
]

// 排序仅作用于明细表；图表与排行始终使用后端返回顺序
const { sortField, sortOrder, handleSort, sorted: sortedStats } = useClientSort(() => stats.value)

const dailyStats = ref<DailyRow[]>([])
// 是否已激活过「生成统计」视图：避免图表在容器尚未可见/未展开时 init，
// 否则 echarts.init 时 clientHeight=0 会打印 DOM 尺寸警告。
const statsActivated = ref(false)
const summary = ref<SummaryData>({
  total_tasks: 0, total_completed: 0, total_failed: 0,
  total_points_consumed: 0, active_users: 0, total_balance: 0,
})
const statsLoading = ref(false)
const statsUpdatedAt = ref('')
// 生成统计的日期区间必填：后端始终需要 start_date / end_date
function defaultStatsRange(): [Date, Date] {
  return [new Date(Date.now() - 30 * 86400000), new Date()]
}
const statsDateRange = ref<[Date, Date]>(defaultStatsRange())
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

  // 金额：消耗积分随时间
  if (statsMetric.value === 'cost') {
    return {
      color: [CHART_COLORS.orange],
      tooltip: { ...tooltipBase, formatter: (p: any) => {
        const credits = dailyStats.value[p[0].dataIndex]?.total_cost ?? 0
        return `${p[0].axisValue}<br/>消耗 ${formatCredits(credits, { creditDigits: 2 })}`
      } },
      grid,
      xAxis,
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `${v}`, color: CHART_NEUTRALS.textTertiary },
        splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
      },
      series: [{
        name: '消耗金额', type: 'line',
        data: dailyStats.value.map(d => d.total_cost),
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
const barHint = computed(() => statsMetric.value === 'cost' ? '按消耗从高到低' : '成功 / 失败 堆叠')

const barOption = computed(() => {
  const grid = { left: '3%', right: '4%', bottom: '40px', top: '10px', containLabel: true }
  const axisLine = { lineStyle: { color: CHART_NEUTRALS.axisLine } }

  // 金额：每个用户的消耗积分，按消耗降序
  if (statsMetric.value === 'cost') {
    const sorted = [...stats.value].sort((a, b) => b.total_cost - a.total_cost)
    return {
      color: [CHART_COLORS.orange],
      tooltip: { ...tooltipBase, formatter: (p: any) => {
        const credits = sorted[p[0].dataIndex]?.total_cost ?? 0
        return `${p[0].name}<br/>消耗 ${formatCredits(credits, { creditDigits: 2 })}`
      } },
      grid,
      xAxis: {
        type: 'category' as const, data: sorted.map(s => s.username),
        axisLabel: { rotate: 30, color: CHART_NEUTRALS.textTertiary }, axisLine,
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: (v: number) => `${v}`, color: CHART_NEUTRALS.textTertiary },
        splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
      },
      series: [{
        name: '消耗金额', type: 'bar',
        data: sorted.map(s => s.total_cost),
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
    statsUpdatedAt.value = toBJMinute(new Date().toISOString()).slice(11)
  } catch {
    error('加载统计失败')
  } finally {
    statsLoading.value = false
  }
}

function handleStatsSearch() { loadStats() }

/** 区间必填，选择器清除（✕）时回到默认「最近30天」并重查，避免 params 少掉 start_date/end_date */
function handleStatsDateRangeChange(v: [Date, Date] | null) {
  if (!v) {
    statsDateRange.value = defaultStatsRange()
    loadStats()
    return
  }
  statsDateRange.value = v
}

// 周期切换需重新分桶（金额/次数是前端切换，无需请求）
watch(statsGranularity, () => loadStats())

// ─── 视图切换 / 快捷区间（纯视图内）───
/** 沿用原 handleTabChange 的激活时序：图表在面板可见后的下一帧才挂载 */
function switchView(v: 'activity' | 'stats') {
  if (v === activeTab.value) return
  activeTab.value = v
  handleTabChange(v)
}

type RangeShortcut = { text: string; value: () => [Date, Date] }

/** 快捷区间：作用于当前视图。流水视图改 ref 由 watch 统一重查；统计视图显式查询 */
function applyRangeShortcut(s: RangeShortcut) {
  if (isLog.value) {
    actDateRange.value = s.value()
    return
  }
  handleStatsDateRangeChange(s.value())
  loadStats()
}

function isRangeActive(s: RangeShortcut): boolean {
  const range = isLog.value ? actDateRange.value : statsDateRange.value
  if (!range) return false
  const [start, end] = s.value()
  return fmtDate(range[0]) === fmtDate(start) && fmtDate(range[1]) === fmtDate(end)
}

const statsScope = computed(
  () => `${fmtDate(statsDateRange.value[0])} ~ ${fmtDate(statsDateRange.value[1])}`,
)

function rate(n: number): string {
  const total = summary.value.total_tasks
  return total ? `${Math.round((n / total) * 1000) / 10}%` : '—'
}

const kpiCredits = computed(() => formatCredits(summary.value.total_points_consumed, { creditDigits: 2 }))
const kpiBalance = computed(() => formatCredits(summary.value.total_balance, { creditDigits: 2 }))

interface KpiTile {
  key: string
  label: string
  value: string
  sub: string
  tone?: string
  interactive?: boolean
  hint?: string
}

/** 常驻指标带：口径 = 统计区间（后端 getStatsSummary），两视图共用 */
const kpiTiles = computed<KpiTile[]>(() => [
  {
    key: 'tasks', label: '提交任务', value: String(summary.value.total_tasks),
    sub: `活跃用户 ${summary.value.active_users} 人`,
  },
  {
    key: 'ok', label: '成功', value: String(summary.value.total_completed),
    sub: `成功率 ${rate(summary.value.total_completed)}`, tone: 'is-ok',
  },
  {
    key: 'fail', label: '失败', value: String(summary.value.total_failed),
    sub: `失败率 ${rate(summary.value.total_failed)}`, tone: 'is-fail',
    interactive: true, hint: '在任务流水中筛出失败记录',
  },
  {
    key: 'cost', label: '积分消耗', value: kpiCredits.value,
    sub: `账户余额 ${kpiBalance.value}`,
  },
])

function onKpiPick(t: KpiTile) {
  if (t.key !== 'fail') return
  actFilterStatus.value = 'failed'
  switchView('activity')
}

function handleTabChange(t: string) {
  if (t === 'stats') {
    // nextTick：先让新视图完成布局，再挂载图表，
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
  // 指标带跨视图常驻，故统计概览随首屏一起取数；图表挂载仍等视图首次打开
  loadActivity()
  loadStats()
})
</script>

<template>
  <PageLayout
    title="生图日志"
    subtitle="逐条留痕用于排查个案，统计口径用于读经营趋势；顶部指标带在两个视图之间常驻。"
    content-padding="0"
    :show-footer="showLogPagination"
  >
    <template #extra>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        :model-value="activeTab"
        @update:model-value="(v) => { if (v) switchView(String(v) as 'activity' | 'stats') }"
      >
        <ToggleGroupItem value="activity">任务与积分</ToggleGroupItem>
        <ToggleGroupItem value="stats">生成统计</ToggleGroupItem>
      </ToggleGroup>
    </template>

    <!-- 筛选行：当前视图的全部条件，永不下沉到滚动区 -->
    <template #filters>
      <div class="flex items-center gap-1">
        <Button
          v-for="s in dateShortcuts"
          :key="s.text"
          variant="ghost"
          size="xs"
          :class="isRangeActive(s) ? 'bg-muted text-foreground' : 'text-muted-foreground'"
          @click="applyRangeShortcut(s)"
        >
          {{ s.text }}
        </Button>
      </div>

      <UiDateRangePicker
        v-if="isLog"
        :model-value="actDateRange"
        :shortcuts="dateShortcuts"
        placeholder="开始日期 ~ 结束日期"
        @update:model-value="(v) => (actDateRange = v)"
      />
      <UiDateRangePicker
        v-else
        :model-value="statsDateRange"
        :shortcuts="dateShortcuts"
        placeholder="开始日期 ~ 结束日期"
        @update:model-value="handleStatsDateRangeChange"
      />

      <span class="mx-1 h-4 w-px shrink-0 bg-(--momo-color-border-soft)" />

      <!-- 流水视图条件 -->
      <template v-if="isLog">
        <div class="relative w-44">
          <Input v-model="actFilterUser" placeholder="用户名/昵称/邮箱" class="pr-7" />
          <button
            v-if="actFilterUser"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            title="清除"
            @click="actFilterUser = ''"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <div class="relative w-52">
          <Input v-model="actFilterTaskId" placeholder="任务号（gen-xxx，兼容旧渠道号）" class="pr-7" />
          <button
            v-if="actFilterTaskId"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            title="清除"
            @click="actFilterTaskId = ''"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <Select
          :model-value="actFilterType || ALL"
          @update:model-value="(v) => (actFilterType = String(v) === ALL ? '' : String(v))"
        >
          <SelectTrigger class="w-30">
            <SelectValue placeholder="类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">全部类型</SelectItem>
            <SelectItem value="task">生成</SelectItem>
            <SelectItem value="txn">充值/扣减</SelectItem>
          </SelectContent>
        </Select>
        <Select
          :model-value="actFilterStatus || ALL"
          @update:model-value="(v) => (actFilterStatus = String(v) === ALL ? '' : String(v))"
        >
          <SelectTrigger class="w-30">
            <SelectValue placeholder="状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">全部状态</SelectItem>
            <SelectItem v-for="(label, key) in statusMap" :key="key" :value="String(key)">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </template>

      <!-- 统计视图条件 -->
      <template v-else>
        <Select
          :model-value="statsUserId ? String(statsUserId) : ALL"
          @update:model-value="(v) => (statsUserId = String(v) === ALL ? null : Number(v))"
        >
          <SelectTrigger class="w-45">
            <SelectValue placeholder="全部用户" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">全部用户</SelectItem>
            <SelectItem v-for="u in allUsers" :key="u.id" :value="String(u.id)">
              {{ u.username }}
            </SelectItem>
          </SelectContent>
        </Select>
        <span class="text-muted-foreground ml-1 text-xs">口径</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          :model-value="statsMetric"
          @update:model-value="(v) => { if (v) statsMetric = String(v) as 'count' | 'cost' }"
        >
          <ToggleGroupItem value="count">次数</ToggleGroupItem>
          <ToggleGroupItem value="cost">金额</ToggleGroupItem>
        </ToggleGroup>
        <span class="text-muted-foreground ml-1 text-xs">周期</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          :model-value="statsGranularity"
          @update:model-value="(v) => { if (v) statsGranularity = String(v) as 'day' | 'week' | 'month' }"
        >
          <ToggleGroupItem value="day">日</ToggleGroupItem>
          <ToggleGroupItem value="week">周</ToggleGroupItem>
          <ToggleGroupItem value="month">月</ToggleGroupItem>
        </ToggleGroup>
      </template>

      <!-- 动作簇：右对齐，随视图切换语义（流水=即时生效只需刷新，统计=必须点查询） -->
      <template v-if="isLog">
        <Button
          size="sm"
          :variant="actFilterStatus === 'failed' ? 'default' : 'outline'"
          class="ml-auto"
          @click="toggleFailedOnly"
        >
          <CircleAlert />仅看失败
        </Button>
        <Button v-if="logFilterDirty" variant="ghost" size="sm" @click="clearLogFilters">
          清除筛选
        </Button>
        <Button variant="ghost" size="sm" class="gap-1.5" :disabled="activityLoading" @click="loadActivity">
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': activityLoading }" />刷新
        </Button>
        <span v-if="activity.length" class="text-muted-foreground text-xs tabular-nums">
          本页 {{ activity.length }} / 共 {{ activityTotal }} 条
        </span>
      </template>
      <template v-else>
        <Button class="ml-auto" size="sm" :disabled="statsLoading" @click="handleStatsSearch">
          <Search />查询
        </Button>
        <span v-if="!statsLoading" class="text-muted-foreground text-xs tabular-nums">
          {{ stats.length }} 位用户 · {{ dailyStats.length }} 个数据点
        </span>
      </template>
    </template>

    <!-- 流水视图给满高（表格成为唯一滚动区），统计视图保持自然高度（随主体滚动） -->
    <div class="flex flex-col bg-card" :class="isLog ? 'h-full min-h-0' : 'min-h-full'">
      <!-- ═══ 常驻指标带（吸顶）═══ -->
      <section class="kpi-band" :aria-label="`统计概览 ${statsScope}`">
        <component
          :is="t.interactive ? 'button' : 'div'"
          v-for="t in kpiTiles"
          :key="t.key"
          :type="t.interactive ? 'button' : undefined"
          class="kpi-tile"
          :class="t.tone"
          :title="t.hint"
          @click="onKpiPick(t)"
        >
          <span class="kpi-label">{{ t.label }}</span>
          <Skeleton v-if="statsLoading" class="h-6 w-16" />
          <span v-else class="kpi-value">{{ t.value }}</span>
          <span class="kpi-sub">{{ t.sub }}</span>
        </component>

        <div class="kpi-scope">
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground cursor-pointer text-xs tabular-nums"
            title="切到生成统计视图查看该区间"
            @click="switchView('stats')"
          >
            统计区间 {{ statsScope }}
          </button>
          <span v-if="statsLoading" class="text-muted-foreground text-xs">统计更新中…</span>
          <span v-else-if="statsUpdatedAt" class="text-muted-foreground text-xs tabular-nums">
            更新于 {{ statsUpdatedAt }}
          </span>
          <span v-else class="text-muted-foreground text-xs">统计未取到数据</span>
        </div>
      </section>

      <!-- ═══ 视图 1：任务与积分流水（表格是主体唯一滚动区）═══ -->
      <div v-if="isLog" class="min-h-0 flex-1">
        <Table sticky-header sticky-last-column max-height="100%">
          <TableHeader>
            <TableRow>
              <TableHead class="min-w-[16rem]">记录</TableHead>
              <TableHead class="w-[110px]">用户</TableHead>
              <TableHead class="w-[150px]">模型</TableHead>
              <TableHead class="w-[92px]">状态</TableHead>
              <TableHead class="w-[130px]">积分变动</TableHead>
              <TableHead class="w-[150px]">时间</TableHead>
              <TableHead class="w-[104px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="activityLoading">
              <TableRow v-for="i in 5" :key="i">
                <TableCell :colspan="7"><Skeleton class="h-8 w-full" /></TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow
                v-for="row in activity"
                :key="`${row.type}-${row.id}`"
                class="cursor-pointer"
                @click="openDetail(row)"
              >
                <TableCell>
                  <div class="flex items-center gap-2">
                    <Badge
                      :variant="row.type === 'task' ? 'default' : row.amount >= 0 ? 'success' : 'destructive'"
                    >
                      {{ row.type === 'task' ? '生成' : (reasonLabel[row.reason] || row.reason) }}
                    </Badge>
                    <span
                      v-if="row.type === 'task'"
                      class="text-muted-foreground min-w-0 max-w-[18rem] truncate text-xs tabular-nums"
                      :title="row.task_no || row.toapis_task_id || '-'"
                    >
                      {{ row.task_no || row.toapis_task_id || '-' }}
                    </span>
                  </div>
                  <div
                    class="text-muted-foreground mt-1 max-w-[24rem] truncate text-xs"
                    :title="row.type === 'task' ? (row.prompt || '—') : (row.note || '—')"
                  >
                    {{ row.type === 'task' ? (row.prompt || '—') : (row.note || '—') }}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="max-w-[110px] truncate" :title="row.username">{{ row.username }}</div>
                </TableCell>
                <TableCell>
                  <div class="max-w-[150px] truncate">
                    {{ row.model ? modelCatalog.displayNameFor(row.model) : '—' }}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    v-if="row.type === 'task'"
                    :variant="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'destructive' : 'secondary'"
                  >
                    {{ statusMap[row.status!] || row.status }}
                  </Badge>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell>
                  <span class="font-semibold tabular-nums" :class="row.amount >= 0 ? 'text-success' : 'text-destructive'">
                    {{ row.amount >= 0 ? '+' : '' }}{{ formatCredits(row.amount, { creditDigits: 2 }) }}
                  </span>
                  <div
                    v-if="row.balance_after != null"
                    class="text-muted-foreground mt-1 text-xs tabular-nums"
                  >
                    余 {{ formatCredits(row.balance_after, { creditDigits: 2 }) }}
                  </div>
                </TableCell>
                <TableCell class="text-muted-foreground text-xs tabular-nums">
                  {{ toBJMinute(row.created_at) }}
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="xs" @click.stop="openDetail(row)">详情</Button>
                    <Button
                      v-if="row.type === 'task'"
                      variant="ghost"
                      size="icon-xs"
                      title="删除"
                      class="text-destructive hover:text-destructive"
                      @click.stop="handleDeleteActivity(row)"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              <TableEmpty v-if="!activity.length" :colspan="7">
                <UiEmptyState
                  title="没有符合条件的记录"
                  description="放宽时间区间或清除筛选后再试。"
                />
              </TableEmpty>
            </template>
          </TableBody>
        </Table>
      </div>

      <!-- ═══ 视图 2：生成统计（按「量-排行-构成-明细」四问排布）═══ -->
      <div v-else class="content-max px-(--momo-page-padding) py-4">
        <section class="stat-section">
          <div class="section-head">
            <TrendingUp class="text-muted-foreground size-3.5" />
            <h3 class="section-title">{{ trendTitle }}</h3>
            <span class="section-hint">{{ dailyStats.length }} 个点</span>
          </div>
          <Skeleton v-if="statsLoading || !statsActivated" class="h-[340px] w-full" />
          <VChart v-else-if="dailyStats.length" :option="trendOption" style="height:340px" autoresize />
          <UiEmptyState
            v-else
            title="该区间没有生成记录"
            description="换个时间区间，或在上方选择其他用户后点查询。"
          />
        </section>

        <div class="stat-section grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section>
            <div class="section-head">
              <ChartBar class="text-muted-foreground size-3.5" />
              <h3 class="section-title">{{ barTitle }}</h3>
              <span class="section-hint">{{ barHint }}</span>
            </div>
            <Skeleton v-if="statsLoading || !statsActivated" class="h-[320px] w-full" />
            <VChart v-else-if="stats.length" :option="barOption" style="height:320px" autoresize />
            <UiEmptyState v-else title="暂无数据" description="该区间没有可统计的用户。" />
          </section>

          <section>
            <div class="section-head">
              <ChartPie class="text-muted-foreground size-3.5" />
              <h3 class="section-title">任务构成</h3>
              <span class="section-hint">成功 / 失败 / 进行中</span>
            </div>
            <Skeleton v-if="statsLoading || !statsActivated" class="h-[280px] w-full" />
            <VChart v-else-if="summary.total_tasks" :option="pieOption" style="height:280px" autoresize />
            <UiEmptyState v-else title="暂无数据" />
          </section>
        </div>

        <section class="stat-section">
          <div class="section-head">
            <h3 class="section-title">用户明细</h3>
            <span class="section-hint">点表头排序 · {{ stats.length }} 位用户</span>
          </div>
          <div class="rounded-md border">
            <Table sticky-header max-height="min(58vh, 460px)">
              <TableHeader>
                <TableRow>
                  <TableHead v-for="c in statColumns" :key="c.label" :class="c.cls">
                    <button
                      v-if="c.sortable"
                      class="hover:text-foreground inline-flex items-center gap-1"
                      @click="handleSort(c.key)"
                    >
                      {{ c.label }}
                      <ArrowUp v-if="sortField === c.key && sortOrder === 'asc'" class="size-3.5" />
                      <ArrowDown v-else-if="sortField === c.key && sortOrder === 'desc'" class="size-3.5" />
                      <ArrowUpDown v-else class="text-muted-foreground size-3.5" />
                    </button>
                    <template v-else>{{ c.label }}</template>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-if="statsLoading">
                  <TableRow v-for="i in 5" :key="i">
                    <TableCell :colspan="9"><Skeleton class="h-8 w-full" /></TableCell>
                  </TableRow>
                </template>
                <template v-else>
                  <TableRow v-for="row in sortedStats" :key="row.user_id">
                    <TableCell>{{ row.username }}</TableCell>
                    <TableCell>
                      <Badge :variant="row.status === 'active' ? 'success' : 'destructive'">
                        {{ row.status === 'active' ? '正常' : '禁用' }}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span class="tabular-nums" :class="row.points <= 0 ? 'text-destructive' : ''">{{ formatCredits(row.points, { creditDigits: 2 }) }}</span>
                    </TableCell>
                    <TableCell class="tabular-nums">{{ row.submitted_count }}</TableCell>
                    <TableCell class="tabular-nums">{{ row.completed_count }}</TableCell>
                    <TableCell class="tabular-nums" :class="row.failed_count > 0 ? 'text-destructive' : ''">{{ row.failed_count }}</TableCell>
                    <TableCell class="tabular-nums">{{ formatCredits(row.total_cost, { creditDigits: 2 }) }}</TableCell>
                    <TableCell class="text-muted-foreground text-xs tabular-nums">{{ toBJMinute(row.last_submitted_at) }}</TableCell>
                    <TableCell class="text-muted-foreground text-xs tabular-nums">{{ toBJMinute(row.last_completed_at) }}</TableCell>
                  </TableRow>
                  <TableEmpty v-if="!stats.length" :colspan="9">
                    <UiEmptyState title="暂无数据" description="该区间内没有任何用户产生记录。" />
                  </TableEmpty>
                </template>
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <UiPagination
        v-model:current-page="activityPage"
        v-model:page-size="activityPageSize"
        :total="activityTotal"
        :show-size-selector="false"
        @current-change="loadActivity"
      />
    </template>

    <!-- 记录详情：表格压缩到 7 列后，全量字段与删除动作收在这里 -->
    <Sheet :open="detailOpen" @update:open="(v: boolean) => (detailOpen = v)">
      <SheetContent
        side="right"
        class="gap-0 p-0"
        style="width: 27rem; max-width: calc(100vw - 2rem)"
      >
        <SheetHeader class="border-b px-5 py-4 text-left">
          <SheetTitle class="flex items-center gap-2">
            {{ detailRow?.type === 'task' ? '生成任务记录' : '积分收支记录' }}
            <Badge
              v-if="detailRow"
              :variant="detailRow.type === 'task' ? 'default' : detailRow.amount >= 0 ? 'success' : 'destructive'"
            >
              {{ detailRow.type === 'task' ? '生成' : (reasonLabel[detailRow.reason] || detailRow.reason) }}
            </Badge>
            <Badge
              v-if="detailRow?.type === 'task'"
              :variant="detailRow.status === 'completed' ? 'success' : detailRow.status === 'failed' ? 'destructive' : 'secondary'"
            >
              {{ statusMap[detailRow.status!] || detailRow.status }}
            </Badge>
          </SheetTitle>
          <SheetDescription class="truncate font-mono text-xs">
            {{ detailRow
              ? (detailRow.type === 'task'
                ? (detailRow.task_no || detailRow.toapis_task_id || '无任务号')
                : `流水 #${detailRow.id}`)
              : '' }}
          </SheetDescription>
        </SheetHeader>

        <div v-if="detailRow" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <dl class="detail-grid">
            <dt>用户</dt>
            <dd>{{ detailRow.username }} <span class="text-muted-foreground">（#{{ detailRow.user_id }}）</span></dd>
            <dt>模型</dt>
            <dd>{{ detailRow.model ? modelCatalog.displayNameFor(detailRow.model) : '—' }}</dd>
            <dt>渠道</dt>
            <dd>{{ detailRow.type === 'task' ? (detailRow.provider_code || '—') : '—' }}</dd>
            <dt>渠道任务号</dt>
            <dd class="break-all font-mono text-xs">{{ detailRow.toapis_task_id || '—' }}</dd>
            <dt>积分变动</dt>
            <dd>
              <span
                class="font-semibold tabular-nums"
                :class="detailRow.amount >= 0 ? 'text-success' : 'text-destructive'"
              >
                {{ detailRow.amount >= 0 ? '+' : '' }}{{ formatCredits(detailRow.amount, { creditDigits: 2 }) }}
              </span>
            </dd>
            <dt>变动后余额</dt>
            <dd class="tabular-nums">
              {{ detailRow.balance_after == null ? '—' : formatCredits(detailRow.balance_after, { creditDigits: 2 }) }}
            </dd>
            <dt>操作人</dt>
            <dd>{{ detailRow.type === 'task' ? '—' : (detailRow.operator_name || '系统') }}</dd>
            <dt>时间</dt>
            <dd class="tabular-nums">{{ toBJMinute(detailRow.created_at) }}</dd>
          </dl>

          <div class="mt-4">
            <div class="text-muted-foreground text-xs">{{ detailRow.type === 'task' ? '提示词' : '备注' }}</div>
            <p class="border-input bg-muted/40 mt-1.5 max-h-[40vh] overflow-y-auto rounded-md border p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
              {{ (detailRow.type === 'task' ? detailRow.prompt : detailRow.note) || '—' }}
            </p>
          </div>
        </div>

        <SheetFooter v-if="detailRow?.type === 'task'" class="border-t px-5 py-3 sm:flex-row sm:justify-end">
          <Button variant="outline" size="sm" @click="detailOpen = false">关闭</Button>
          <Button variant="destructive" size="sm" @click="deleteFromDetail">
            <Trash2 />删除记录
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </PageLayout>
</template>

<style scoped>
/* ── 常驻指标带：吸顶，滚动时不离开视野 ── */
.kpi-band {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  flex-shrink: 0;
  gap: 4px 0;
  padding: 8px var(--momo-page-padding);
  background: var(--momo-color-bg);
  border-bottom: 1px solid var(--momo-color-border-light);
}
.kpi-tile {
  display: flex;
  min-width: 9rem;
  flex: 0 1 auto;
  flex-direction: column;
  gap: 1px;
  padding: 2px 20px;
  text-align: left;
  border-left: 1px solid var(--momo-color-border-light);
}
.kpi-tile:first-child {
  padding-left: 0;
  border-left: none;
}
.kpi-tile[title] {
  cursor: pointer;
  transition: background-color 0.15s;
}
.kpi-tile[title]:hover {
  background: var(--momo-color-bg-muted);
}
.kpi-label {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
}
.kpi-value {
  font-size: var(--momo-font-size-xl);
  font-weight: var(--momo-font-weight-semibold);
  line-height: var(--momo-leading-tight);
  color: var(--momo-color-text);
  font-variant-numeric: tabular-nums;
}
.kpi-sub {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.kpi-tile.is-ok .kpi-value {
  color: var(--momo-color-status-done-text);
}
.kpi-tile.is-fail .kpi-value {
  color: var(--momo-color-danger);
}
.kpi-scope {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: auto;
  padding-left: 20px;
  text-align: right;
  border-left: 1px solid var(--momo-color-border-light);
}

/* ── 统计视图分区：一条发丝线代替原来的套娃卡片 ── */
.stat-section + .stat-section {
  margin-top: var(--momo-space-4);
  padding-top: var(--momo-space-4);
  border-top: 1px solid var(--momo-color-border-light);
}
.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.section-title {
  font-size: var(--momo-font-size-md);
  font-weight: var(--momo-font-weight-medium);
  color: var(--momo-color-text);
}
.section-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
}

/* ── 详情抽屉字段表 ── */
.detail-grid {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  gap: 0 12px;
  font-size: var(--momo-font-size-base);
}
.detail-grid dt {
  color: var(--momo-color-text-tertiary);
}
.detail-grid dt,
.detail-grid dd {
  padding: 9px 0;
  border-top: 1px solid var(--momo-color-border-light);
}
.detail-grid dt:first-of-type,
.detail-grid dd:first-of-type {
  border-top: none;
}
</style>
