<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { toBJDate } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { pointsApi } from '@/services/pointsApi'
import { formatCredits } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'
import { CHART_COLORS, CHART_NEUTRALS, withAlpha } from '@/plugins/echartsPalette'

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
  { text: '最近7天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 7); return [s, e] } },
  { text: '最近30天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 30); return [s, e] } },
  { text: '最近90天', value: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 90); return [s, e] } },
]

// el-date-picker value-format="YYYY-MM-DD"：选过后 v-model 变字符串，初始是 Date，两种都要兼容。
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
      backgroundColor: 'rgba(255,255,255,0.95)',
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
    backgroundColor: 'rgba(255,255,255,0.95)',
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
</script>

<template>
  <PageLayout>
    <template #header><h2>我的消耗</h2></template>

    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
      平台 Key 消耗为实际扣费；个人 Key 消耗按平台单价折算（实际 ToAPIs 花费以你的 ToAPIs 账户为准）。
    </el-alert>

    <!-- KPI -->
    <div class="kpi-row">
      <div class="kpi-card primary">
        <div class="kpi-label">当前余额</div>
        <div class="kpi-value">{{ formatCredits(summary.balance, { creditDigits: 2 }) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">累计消费</div>
        <div class="kpi-value">{{ formatCredits(summary.total_consumed, { creditDigits: 2 }) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">累计充值</div>
        <div class="kpi-value">{{ formatCredits(summary.total_recharged, { creditDigits: 2 }) }}</div>
      </div>
    </div>

    <!-- 控件 -->
    <div class="toolbar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :shortcuts="dateShortcuts"
        value-format="YYYY-MM-DD"
        style="width:280px"
      />
      <el-radio-group v-model="granularity" size="small">
        <el-radio-button value="day">日</el-radio-button>
        <el-radio-button value="week">周</el-radio-button>
        <el-radio-button value="month">月</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 消耗趋势 -->
    <div class="chart-card" v-loading="loading">
      <div class="chart-card-header">消耗趋势</div>
      <VChart v-if="daily.length > 0" :option="consumptionOption" style="height:340px" autoresize />
      <el-empty v-else description="该时段暂无消耗记录" />
    </div>

    <!-- 充值趋势 -->
    <div class="chart-card">
      <div class="chart-card-header">充值趋势</div>
      <VChart v-if="daily.length > 0" :option="rechargeOption" style="height:340px" autoresize />
      <el-empty v-else description="该时段暂无充值记录" />
    </div>

    <!-- 明细表 -->
    <div class="chart-card">
      <div class="chart-card-header">消耗明细</div>
      <el-table :data="tableData" stripe size="small" empty-text="暂无数据">
        <el-table-column prop="date" label="周期" min-width="140" />
        <el-table-column label="平台消耗" min-width="200">
          <template #default="{ row }">
            <span style="color: var(--el-color-danger); font-weight: 600">
              {{ formatCredits(row.spent, { creditDigits: 2 }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="个人消耗" min-width="200">
          <template #default="{ row }">
            <span style="color: var(--el-color-primary); font-weight: 600">
              {{ formatCredits(row.personal, { creditDigits: 2 }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="充值" min-width="200">
          <template #default="{ row }">
            <span style="color: var(--el-color-success); font-weight: 600">
              {{ formatCredits(row.recharged, { creditDigits: 2 }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="count" label="笔数" width="100" />
      </el-table>
    </div>
  </PageLayout>
</template>

<style scoped>
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}
.kpi-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  padding: 18px 20px;
}
.kpi-card.primary {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-5);
}
.kpi-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.kpi-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
  word-break: break-all;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.chart-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  padding: 20px;
  margin-bottom: 20px;
}
.chart-card-header {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .kpi-row { grid-template-columns: 1fr; }
}
</style>
