<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ChevronRight, Coins, Wallet } from '@lucide/vue'
import { toBJDate } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { pointsApi } from '@/services/pointsApi'
import { ceilCreditValue, formatCredits } from '@/types/adapter'
import { cn } from '@/lib/utils'
import { DsScrollPage as PageLayout } from '@/components/design-system'
import { CHART_COLORS, CHART_NEUTRALS, withAlpha } from '@/plugins/echartsPalette'
import { Badge } from '@/components/design-system/primitives/badge'
import { Button } from '@/components/design-system/primitives/button'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/design-system/primitives/toggle-group'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/design-system/primitives/collapsible'
import { UiDateRangePicker, UiEmptyState } from '@/components/design-system'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/design-system/primitives/table'

defineOptions({ name: 'MyConsumption' })

const { error } = useUiFeedback()

interface Summary { balance: number; total_spent: number; total_recharged: number; total_consumed: number }
interface DailyRow { date: string; spent: number; personal: number; recharged: number; count: number }

const summary = ref<Summary>({ balance: 0, total_spent: 0, total_recharged: 0, total_consumed: 0 })
const daily = ref<DailyRow[]>([])
const loading = ref(false)

const granularity = ref<'day' | 'week' | 'month'>('day')
const dateRange = ref<[Date, Date]>([
  new Date(Date.now() - 30 * 86400000),
  new Date(),
])

const dateShortcuts = [
  { text: '最近7天', value: (): [Date, Date] => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 7); return [s, e] } },
  { text: '最近30天', value: (): [Date, Date] => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 30); return [s, e] } },
  { text: '最近90天', value: (): [Date, Date] => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 90); return [s, e] } },
]

// 原生 date input（替代原 EP 日期范围选择器）value-format="YYYY-MM-DD"：选过后 v-model 变字符串，初始是 Date，两种都要兼容。
function fmtDate(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : toBJDate(d.toISOString())
}

async function loadSummary() {
  try {
    const res = await pointsApi.getMyBalance()
    summary.value = res.data.data || summary.value
  } catch { /* 余额加载失败不阻塞趋势 */ }
}

async function loadDaily() {
  loading.value = true
  try {
    const res = await pointsApi.getMyDailyStats({
      granularity: granularity.value,
      start_date: fmtDate(dateRange.value[0]),
      end_date: fmtDate(dateRange.value[1]),
    })
    daily.value = res.data.data || []
  } catch {
    error('加载消耗趋势失败')
  } finally {
    loading.value = false
  }
}

// 粒度切换需重新分桶；日期范围变化也重新查
watch([granularity, dateRange], () => loadDaily())

// 通用趋势图构造：消耗(橙) / 充值(绿)
function makeTrendOption(hex: string, field: 'spent' | 'recharged', name: string) {
  return {
    color: [hex],
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: CHART_NEUTRALS.surface,
      borderColor: CHART_NEUTRALS.tooltipBorder,
      textStyle: { color: CHART_NEUTRALS.textPrimary, fontSize: 13 },
      formatter: (p: any) => {
        const credits = daily.value[p[0].dataIndex]?.[field] ?? 0
        return `${p[0].axisValue}<br/>${name} ${formatCredits(credits, { creditDigits: 2 })}`
      },
    },
    grid: { left: '3%', right: '4%', bottom: '40px', top: '20px', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: daily.value.map(d => d.date),
      axisLabel: { rotate: 45, color: CHART_NEUTRALS.textTertiary, fontSize: 11 },
      axisLine: { lineStyle: { color: CHART_NEUTRALS.axisLine } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { formatter: (v: number) => `${v}`, color: CHART_NEUTRALS.textTertiary },
      splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
    },
    series: [{
      name, type: 'line',
      data: daily.value.map(d => d[field]),
      smooth: true, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 3, shadowBlur: 8, shadowColor: withAlpha(hex, 0.3) },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: withAlpha(hex, 0.18) }, { offset: 1, color: withAlpha(hex, 0) }] } },
      markPoint: { data: [{ type: 'max', name: '最大' }], symbolSize: 40, label: { fontSize: 10 } },
    }],
  }
}
// 消耗趋势：平台 Key（实际扣费）+ 个人 Key（按平台单价折算）两条线
const consumptionOption = computed(() => ({
  color: [CHART_COLORS.orange, CHART_COLORS.blue],
  tooltip: {
    trigger: 'axis' as const,
    backgroundColor: CHART_NEUTRALS.surface,
    borderColor: CHART_NEUTRALS.tooltipBorder,
    textStyle: { color: CHART_NEUTRALS.textPrimary, fontSize: 13 },
    formatter: (params: any) => {
      const row = daily.value[params[0].dataIndex]
      if (!row) return ''
      const lines = params.map((s: any) => {
        const credits = s.seriesName === '平台 Key' ? row.spent : row.personal
        return `${s.marker}${s.seriesName}：${formatCredits(credits, { creditDigits: 2 })}`
      })
      return `${params[0].axisValue}<br/>${lines.join('<br/>')}`
    },
  },
  legend: { data: ['平台 Key', '个人 Key'], bottom: 0, textStyle: { color: CHART_NEUTRALS.textSecondary } },
  grid: { left: '3%', right: '4%', bottom: '40px', top: '20px', containLabel: true },
  xAxis: {
    type: 'category' as const,
    data: daily.value.map(d => d.date),
    axisLabel: { rotate: 45, color: CHART_NEUTRALS.textTertiary, fontSize: 11 },
    axisLine: { lineStyle: { color: CHART_NEUTRALS.axisLine } },
  },
  yAxis: {
    type: 'value' as const,
    axisLabel: { formatter: (v: number) => `${v}`, color: CHART_NEUTRALS.textTertiary },
    splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } },
  },
  series: [
    {
      name: '平台 Key', type: 'line',
      data: daily.value.map(d => d.spent),
      smooth: true, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 3 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: withAlpha(CHART_COLORS.orange, 0.18) }, { offset: 1, color: withAlpha(CHART_COLORS.orange, 0) }] } },
    },
    {
      name: '个人 Key', type: 'line',
      data: daily.value.map(d => d.personal),
      smooth: true, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 3 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: withAlpha(CHART_COLORS.blue, 0.18) }, { offset: 1, color: withAlpha(CHART_COLORS.blue, 0) }] } },
    },
  ],
}))
const rechargeOption = computed(() => makeTrendOption(CHART_COLORS.green, 'recharged', '充值'))

// 明细表按周期倒序（接口返回升序）
const tableData = computed(() => [...daily.value].reverse())

onMounted(() => {
  loadSummary()
  loadDaily()
})

/* ─────────────────────────────────────────────
   以下为纯视图层派生：区间合计、粒度文案与折叠状态。
   全部由已有接口数据推导，不新增请求、不改变任何查询条件。
   ───────────────────────────────────────────── */

/** 充值趋势属于次要信息，默认折叠，避免把明细表挤出首屏 */
const rechargeOpen = ref(false)

/** 与 formatCredits 完全同一取整口径，仅去掉「积分」后缀；单位在表头声明一次 */
function credits(value: number): string {
  return ceilCreditValue(value, 2).toFixed(2)
}

const rangeSpent = computed(() => daily.value.reduce((s, d) => s + d.spent, 0))
const rangePersonal = computed(() => daily.value.reduce((s, d) => s + d.personal, 0))
const rangeRecharged = computed(() => daily.value.reduce((s, d) => s + d.recharged, 0))
const rangeCount = computed(() => daily.value.reduce((s, d) => s + d.count, 0))

const granularityLabel = computed(
  () => ({ day: '按日', week: '按周', month: '按月' })[granularity.value],
)
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>我的消耗</h2>
      <p class="text-muted-foreground mt-1 text-sm">
        按日 / 周 / 月查看积分消耗与充值明细。
      </p>
    </template>

    <template #extra>
      <RouterLink to="/my-quota">
        <Button variant="outline" size="sm" class="gap-1.5">
          <Coins class="size-3.5" />
          积分流水
        </Button>
      </RouterLink>
      <RouterLink to="/pricing">
        <Button variant="ghost" size="sm" class="gap-1.5">
          <Wallet class="size-3.5" />
          计费说明
        </Button>
      </RouterLink>
    </template>

    <div class="content-max flex flex-col gap-4">
      <!-- ════ 账户总览 + 当前筛选区间的派生合计（收进一条分隔带，不再是三张大卡片）════ -->
      <section class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <dl class="flex min-w-0 flex-wrap items-end gap-x-8 gap-y-3">
          <div class="min-w-0">
            <dt class="text-muted-foreground text-sm font-medium tracking-wider uppercase">当前余额</dt>
            <dd class="mt-1.5 text-sm leading-none font-semibold tabular-nums">
              {{ formatCredits(summary.balance, { creditDigits: 2 }) }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-muted-foreground text-sm font-medium tracking-wider uppercase">累计消费</dt>
            <dd class="mt-1.5 text-sm leading-none font-semibold tabular-nums">
              {{ formatCredits(summary.total_consumed, { creditDigits: 2 }) }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-muted-foreground text-sm font-medium tracking-wider uppercase">累计充值</dt>
            <dd class="text-muted-foreground mt-1.5 text-sm leading-none font-semibold tabular-nums">
              {{ formatCredits(summary.total_recharged, { creditDigits: 2 }) }}
            </dd>
          </div>
          <div class="min-w-0 border-l pl-8 max-md:border-l-0 max-md:pl-0">
            <dt class="text-muted-foreground text-sm font-medium tracking-wider uppercase">
              区间消耗
              <span class="normal-case">{{ granularityLabel }}</span>
            </dt>
            <dd class="text-destructive mt-1.5 text-sm leading-none font-semibold tabular-nums">
              {{ formatCredits(rangeSpent, { creditDigits: 2 }) }}
            </dd>
          </div>
        </dl>

        <!-- 区间口径说明：原先是整条 Alert，降权为一行注释 -->
        <p class="text-muted-foreground max-w-96 text-sm leading-5">
          区间合计随筛选变化。平台 Key 为实际扣费；个人 Key 按平台单价折算，实际 ToAPIs 花费以你的 ToAPIs 账户为准。
        </p>
      </section>

      <!-- ════ 筛选工具条：唯一影响本页数据的一组控件，吸顶常驻 ════ -->
      <div class="bg-background sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-y py-2.5">
        <UiDateRangePicker
          :model-value="dateRange"
          :shortcuts="dateShortcuts"
          @update:model-value="(v) => { if (v) dateRange = v }"
        />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          :model-value="granularity"
          @update:model-value="(v) => { if (v) { granularity = String(v) as 'day' | 'week' | 'month' } }"
        >
          <ToggleGroupItem value="day">日</ToggleGroupItem>
          <ToggleGroupItem value="week">周</ToggleGroupItem>
          <ToggleGroupItem value="month">月</ToggleGroupItem>
        </ToggleGroup>
        <Badge variant="secondary" class="tabular-nums">
          {{ daily.length }} 个周期
        </Badge>
        <span v-if="rangeCount" class="text-muted-foreground text-sm tabular-nums">
          共 {{ rangeCount }} 笔
        </span>
      </div>

      <!-- ════ 消耗趋势：本页的主视觉 ════ -->
      <section class="min-w-0">
        <div class="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 class="text-sm font-semibold">消耗趋势</h3>
          <span class="text-muted-foreground text-sm">平台 Key / 个人 Key 双序列</span>
        </div>
        <div class="rounded-lg border bg-card p-3">
          <Skeleton v-if="loading" class="h-[300px] w-full" />
          <VChart v-else-if="daily.length > 0" :option="consumptionOption" style="height:300px" autoresize />
          <UiEmptyState
            v-else
            title="该时段暂无消耗记录"
            description="换个日期区间，或先去工作台生成一张图再回来看看。"
          />
        </div>
      </section>

      <!-- ════ 充值趋势：次要，默认折叠 ════ -->
      <Collapsible v-model:open="rechargeOpen">
        <CollapsibleTrigger
          class="hover:bg-muted/40 flex w-full cursor-pointer items-center gap-2 rounded-md py-2 text-left transition-colors"
        >
          <ChevronRight :class="cn('text-muted-foreground size-3.5 shrink-0 transition-transform', rechargeOpen && 'rotate-90')" />
          <h3 class="text-sm font-semibold">充值趋势</h3>
          <span class="text-muted-foreground min-w-0 flex-1 truncate text-sm">
            管理员充值与退款计入余额，不影响消耗
          </span>
          <span class="text-success text-sm font-medium tabular-nums">
            {{ formatCredits(rangeRecharged, { creditDigits: 2 }) }}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent class="mt-1.5">
          <div class="rounded-lg border bg-card p-3">
            <VChart v-if="daily.length > 0" :option="rechargeOption" style="height:240px" autoresize />
            <UiEmptyState
              v-else
              title="该时段暂无充值记录"
              description="积分由管理员统一充值，如需调整请联系管理员。"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <!-- ════ 明细表 ════ -->
      <section class="min-w-0">
        <div class="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 class="text-sm font-semibold">消耗明细</h3>
          <span class="text-muted-foreground text-sm">
            {{ granularityLabel }}倒序 · 共 {{ tableData.length }} 行 · 单位：积分
          </span>
        </div>

        <div class="overflow-hidden rounded-lg border bg-card ">
          <Table >
            <TableHeader>
              <TableRow>
                <TableHead class="w-[130px] uppercase">周期</TableHead>
                <TableHead class="w-[150px] text-right uppercase">平台消耗</TableHead>
                <TableHead class="w-[150px] text-right uppercase">个人消耗</TableHead>
                <TableHead class="w-[150px] text-right uppercase">充值</TableHead>
                <TableHead class="w-[86px] text-right uppercase">笔数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="loading">
                <TableRow v-for="i in 5" :key="`sk-${i}`">
                  <TableCell :colspan="5"><Skeleton class="h-5 w-full" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="row in tableData" :key="row.date">
                  <TableCell class="tabular-nums">{{ row.date }}</TableCell>
                  <TableCell class="text-right tabular-nums">
                    <span :class="row.spent ? 'text-destructive font-semibold' : 'text-muted-foreground/50'">
                      {{ row.spent ? credits(row.spent) : '—' }}
                    </span>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    <span :class="row.personal ? 'text-primary font-semibold' : 'text-muted-foreground/50'">
                      {{ row.personal ? credits(row.personal) : '—' }}
                    </span>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    <span :class="row.recharged ? 'text-success font-semibold' : 'text-muted-foreground/50'">
                      {{ row.recharged ? credits(row.recharged) : '—' }}
                    </span>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    <span :class="row.count ? '' : 'text-muted-foreground/50'">{{ row.count || '—' }}</span>
                  </TableCell>
                </TableRow>
                <TableEmpty v-if="!tableData.length" :colspan="5">
                  <UiEmptyState
                    title="该时段暂无数据"
                    description="上方筛选为空时不会返回任何周期，放宽日期范围即可。"
                  />
                </TableEmpty>
              </template>
            </TableBody>
            <TableFooter v-if="!loading && tableData.length">
              <TableRow>
                <TableCell >
                  合计 · {{ granularityLabel }} {{ tableData.length }} 个周期
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ credits(rangeSpent) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ credits(rangePersonal) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ credits(rangeRecharged) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ rangeCount }}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>
    </div>
  </PageLayout>
</template>
