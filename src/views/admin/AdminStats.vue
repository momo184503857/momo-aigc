<script setup lang="ts">
import { CHART_NEUTRALS } from '@/plugins/echartsPalette'
import { Button } from '@/components/design-system'
import { ref, onMounted, computed } from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown } from '@lucide/vue'
import { toBJMinute, toBJDate } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useClientSort } from '@/composables/useClientSort'
const { error } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import { formatCredits } from '@/types/adapter'
import { DsScrollPage as PageLayout } from '@/components/design-system'
import { Badge } from '@/components/design-system/primitives/badge'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/design-system/primitives/toggle-group'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/design-system/primitives/table'
import { UiEmptyState } from '@/components/design-system'

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

interface Column {
  key?: string
  label: string
  cls?: string
  sortable?: boolean
}

const columns: Column[] = [
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

// 排序仅影响本表；用户柱状图与汇总口径始终使用后端返回顺序
const { sortField, sortOrder, handleSort, sorted: sortedStats } = useClientSort(() => stats.value)

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
    emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: CHART_NEUTRALS.shadow } },
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

    <div>
      <!-- Summary Cards -->
      <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div class="bg-card rounded-lg border px-5 py-4">
          <div class="text-muted-foreground mb-1.5 text-sm">总提交</div>
          <div class="text-2xl leading-tight font-bold">{{ summary.total_tasks }}</div>
        </div>
        <div class="bg-card rounded-lg border px-5 py-4">
          <div class="text-muted-foreground mb-1.5 text-sm">总成功</div>
          <div class="text-success text-2xl leading-tight font-bold">{{ summary.total_completed }}</div>
        </div>
        <div class="bg-card rounded-lg border px-5 py-4">
          <div class="text-muted-foreground mb-1.5 text-sm">总失败</div>
          <div class="text-destructive text-2xl leading-tight font-bold">{{ summary.total_failed }}</div>
        </div>
        <div class="bg-card rounded-lg border px-5 py-4">
          <div class="text-muted-foreground mb-1.5 text-sm">积分消耗</div>
          <div class="text-2xl leading-tight font-bold">{{ summary.total_points_consumed }}</div>
        </div>
        <div class="bg-card rounded-lg border px-5 py-4">
          <div class="text-muted-foreground mb-1.5 text-sm">活跃用户</div>
          <div class="text-2xl leading-tight font-bold">{{ summary.active_users }}</div>
        </div>
        <div class="bg-card rounded-lg border px-5 py-4">
          <div class="text-muted-foreground mb-1.5 text-sm">总积分余额</div>
          <div class="text-2xl leading-tight font-bold">{{ summary.total_balance }}</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="surface p-5 lg:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-sm font-semibold">每日生成趋势</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              :model-value="String(chartDays)"
              @update:model-value="(v) => { if (v) handleDaysChange(Number(v)) }"
            >
              <ToggleGroupItem value="7">7天</ToggleGroupItem>
              <ToggleGroupItem value="30">30天</ToggleGroupItem>
              <ToggleGroupItem value="90">90天</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Skeleton v-if="loading" class="h-[300px] w-full" />
          <VChart v-else :option="trendOption" style="height:300px" autoresize />
        </div>
        <div class="surface p-5">
          <div class="mb-3 text-sm font-semibold">任务占比</div>
          <Skeleton v-if="loading" class="h-[300px] w-full" />
          <VChart v-else :option="pieOption" style="height:300px" autoresize />
        </div>
      </div>

      <!-- Bar chart per user -->
      <div class="surface mb-6 p-5">
        <div class="mb-3 text-sm font-semibold">用户生成统计</div>
        <Skeleton v-if="loading" class="h-[300px] w-full" />
        <template v-else>
          <VChart v-if="stats.length > 0" :option="barOption" style="height:300px" autoresize />
          <UiEmptyState v-else title="暂无数据" />
        </template>
      </div>

      <!-- User table -->
      <div class="overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead v-for="c in columns" :key="c.label" :class="c.cls">
                <Button variant="ghost"
                  v-if="c.sortable"
                  class="inline-flex items-center gap-1"
                  @click="handleSort(c.key)"
                >
                  {{ c.label }}
                  <ArrowUp v-if="sortField === c.key && sortOrder === 'asc'" class="size-3.5" />
                  <ArrowDown v-else-if="sortField === c.key && sortOrder === 'desc'" class="size-3.5" />
                  <ArrowUpDown v-else class="text-muted-foreground size-3.5" />
                </Button>
                <template v-else>{{ c.label }}</template>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="loading">
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
                  <span :class="row.points <= 0 ? 'text-destructive' : ''">{{ formatCredits(row.points, { creditDigits: 2 }) }}</span>
                </TableCell>
                <TableCell>{{ row.submitted_count }}</TableCell>
                <TableCell>{{ row.completed_count }}</TableCell>
                <TableCell>{{ row.failed_count }}</TableCell>
                <TableCell>{{ formatCredits(row.total_cost, { creditDigits: 2 }) }}</TableCell>
                <TableCell>{{ toBJMinute(row.last_submitted_at) }}</TableCell>
                <TableCell>{{ toBJMinute(row.last_completed_at) }}</TableCell>
              </TableRow>
              <TableEmpty v-if="!stats.length" :colspan="9">
                <UiEmptyState title="暂无数据" />
              </TableEmpty>
            </template>
          </TableBody>
        </Table>
      </div>
    </div>
  </PageLayout>
</template>
