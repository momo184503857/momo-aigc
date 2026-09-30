<script setup lang="ts">
defineOptions({ name: 'AdminConsumption' })
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { DsScrollPage, DsDatePicker, Input, Label, Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Skeleton, ToggleGroup, ToggleGroupItem, Badge, Table, TableHeader, TableHead, TableBody, TableRow, TableCell, UiPagination } from '@/components/design-system'
import { DataTableColumnHeader } from '@/components/data-table'
import { useAdminConsumption } from '@/composables/useAdminConsumption'
import type { ConsumptionFilter, ConsumptionUser } from '@/services/consumptionTypes'
import { formatCredits } from '@/types/adapter'
import { toBJMinute } from '@/utils/datetime'
import { CHART_COLORS, CHART_NEUTRALS, tooltipBase } from '@/plugins/echartsPalette'
import ConsumptionDetails from './consumption/ConsumptionDetails.vue'
const { startDate, endDate, search, applied, granularity, overview, users, overviewLoading, usersLoading, overviewError, usersError, page, sort, order, rangeError, pendingChanges, loadOverview, loadUsers, query, quickRange, changePeriod, changePage, changeSort } = useAdminConsumption()
const selected = ref<{ user: ConsumptionUser; filter: ConsumptionFilter } | null>(null)
function submit() { if (rangeError.value) return; selected.value = null; query() }
function details(user: ConsumptionUser) { selected.value = { user, filter: { ...applied.value } } }
const stats = computed(() => [
  { label: '净消耗积分', value: formatCredits(overview.value?.summary.net_consumed ?? 0), hint: '含进行中预扣，失败退款后更新' },
  { label: '产生消耗的账号', value: `${overview.value?.summary.consuming_users ?? 0} 人`, hint: '包含普通用户和管理员' },
  { label: '提交任务数', value: `${overview.value?.summary.submitted_count ?? 0} 次`, hint: '统计区间内提交的全部任务' },
  { label: '进行中预扣积分', value: formatCredits(overview.value?.summary.in_progress_credits ?? 0), hint: '已包含在净消耗积分中' },
])
const chart = computed(() => ({
  animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  tooltip: { ...tooltipBase, valueFormatter: (value: number) => formatCredits(value) },
  grid: { left: 16, right: 24, top: 24, bottom: 16, containLabel: true },
  xAxis: { type: 'category', data: overview.value?.trend.map(row => row.date) ?? [], boundaryGap: false, axisLine: { lineStyle: { color: CHART_NEUTRALS.axisLine } }, axisLabel: { color: CHART_NEUTRALS.textSecondary } },
  yAxis: { type: 'value', min: 0, axisLabel: { color: CHART_NEUTRALS.textSecondary }, splitLine: { lineStyle: { color: CHART_NEUTRALS.splitLine } } },
  series: [{ name: '净消耗积分', type: 'line', data: overview.value?.trend.map(row => row.net_consumed) ?? [], showSymbol: true, itemStyle: { color: CHART_COLORS.blue }, lineStyle: { color: CHART_COLORS.blue } }],
}))
</script>
<template>
  <DsScrollPage title="用户消耗">
    <template #filters>
      <form class="flex min-w-0 flex-1 flex-wrap items-end gap-3" @submit.prevent="submit">
        <div class="space-y-1"><Label for="consumption-start">开始日期</Label><DsDatePicker id="consumption-start" v-model="startDate" label="开始日期（北京时间）" :max="endDate" /></div>
        <div class="space-y-1"><Label for="consumption-end">结束日期</Label><DsDatePicker id="consumption-end" v-model="endDate" label="结束日期（北京时间）" :min="startDate" /></div>
        <div class="min-w-0 space-y-1"><Label for="consumption-search">用户</Label><Input id="consumption-search" v-model="search" placeholder="用户名 / 昵称 / 邮箱" /></div>
        <Button type="submit" :disabled="!!rangeError || overviewLoading || usersLoading">查询</Button>
        <div class="flex flex-wrap gap-1" aria-label="快捷日期范围">
          <Button type="button" variant="ghost" size="sm" @click="quickRange('today')">今日</Button><Button type="button" variant="ghost" size="sm" @click="quickRange('week')">近7天</Button><Button type="button" variant="ghost" size="sm" @click="quickRange('month')">本月</Button><Button type="button" variant="ghost" size="sm" @click="quickRange('recent')">近30天</Button>
        </div>
        <p v-if="rangeError" role="alert" class="text-destructive basis-full text-sm">{{ rangeError }}</p>
        <p v-else-if="pendingChanges" role="status" class="text-muted-foreground basis-full text-sm">筛选条件已修改，点击查询后生效。</p>
      </form>
    </template>
    <div class="space-y-4">
      <div class="text-muted-foreground flex flex-wrap items-center gap-2 text-sm"><span>已查询：{{ applied.start_date }} 至 {{ applied.end_date }}（北京时间）</span><Badge variant="outline">所有账号</Badge><span v-if="applied.search">用户包含：{{ applied.search }}</span></div>
      <div v-if="overviewError" role="alert" class="flex flex-wrap items-center gap-3"><span>{{ overviewError }}</span><Button variant="outline" @click="loadOverview">重试总览</Button></div>
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" :aria-busy="overviewLoading">
        <Card v-for="stat in stats" :key="stat.label"><CardHeader><CardDescription>{{ stat.label }}</CardDescription></CardHeader><CardContent class="space-y-2"><Skeleton v-if="overviewLoading" class="h-8 w-full" /><p v-else class="text-2xl font-semibold tabular-nums">{{ stat.value }}</p><p class="text-muted-foreground text-xs">{{ stat.hint }}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader class="flex flex-wrap items-center justify-between gap-3"><div class="space-y-1"><CardTitle>消耗趋势</CardTitle><CardDescription>单位：积分 · {{ granularity === 'week' ? '周一为每周起点' : granularity === 'month' ? '按自然月汇总' : '按北京时间自然日汇总' }}</CardDescription></div><ToggleGroup type="single" variant="outline" :model-value="granularity" aria-label="趋势统计周期" @update:model-value="changePeriod"><ToggleGroupItem value="day">日</ToggleGroupItem><ToggleGroupItem value="week">周</ToggleGroupItem><ToggleGroupItem value="month">月</ToggleGroupItem></ToggleGroup></CardHeader>
        <CardContent>
          <Skeleton v-if="overviewLoading" class="h-64 w-full" />
          <p v-else-if="overviewError" class="text-muted-foreground text-sm">趋势暂不可用，请重试总览。</p>
          <template v-else-if="overview"><p v-if="!overview.summary.submitted_count" role="status" class="text-muted-foreground text-sm">该区间暂无任务，消耗为0。</p><div class="h-64 w-full"><VChart :option="chart" autoresize role="img" aria-label="按所选周期展示净消耗积分趋势" /></div></template>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>用户消耗排行</CardTitle><CardDescription>当前余额为实时快照，不随日期变化；区间内有任务的账号均列出。</CardDescription></CardHeader>
        <CardContent class="space-y-4" :aria-busy="usersLoading">
          <template v-if="usersLoading"><Skeleton class="h-64 w-full" /><p class="sr-only" role="status">正在加载用户统计</p></template>
          <div v-else-if="usersError" role="alert" class="flex flex-wrap items-center gap-3"><span>{{ usersError }}</span><Button variant="outline" @click="loadUsers">重试用户统计</Button></div>
          <template v-else-if="users">
            <Table sticky-last-column aria-label="用户消耗排行">
              <TableHeader><TableRow><TableHead>账号</TableHead><TableHead>昵称</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead><TableHead :aria-sort="sort === 'net_consumed' ? (order === 'asc' ? 'ascending' : 'descending') : 'none'"><DataTableColumnHeader label="净消耗积分" sort-key="net_consumed" :active-key="sort" :active-order="order" @sort="changeSort('net_consumed', $event)" /></TableHead><TableHead :aria-sort="sort === 'submitted_count' ? (order === 'asc' ? 'ascending' : 'descending') : 'none'"><DataTableColumnHeader label="任务数" sort-key="submitted_count" :active-key="sort" :active-order="order" @sort="changeSort('submitted_count', $event)" /></TableHead><TableHead>成功</TableHead><TableHead>失败</TableHead><TableHead>当前余额</TableHead><TableHead>最近提交</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody><TableRow v-for="user in users.records" :key="user.user_id"><TableCell>{{ user.username }}</TableCell><TableCell>{{ user.nickname || '—' }}</TableCell><TableCell>{{ user.role === 'admin' ? '管理员' : '用户' }}</TableCell><TableCell><Badge variant="outline">{{ user.status === 'active' ? '正常' : '停用' }}</Badge></TableCell><TableCell class="tabular-nums">{{ formatCredits(user.net_consumed) }}</TableCell><TableCell class="tabular-nums">{{ user.submitted_count }}</TableCell><TableCell>{{ user.completed_count }}</TableCell><TableCell>{{ user.failed_count }}</TableCell><TableCell class="tabular-nums">{{ formatCredits(user.current_balance) }}</TableCell><TableCell class="whitespace-nowrap">{{ toBJMinute(user.last_submitted_at) }}</TableCell><TableCell><Button variant="outline" size="sm" :aria-label="`查看 ${user.username} 的消耗明细`" @click="details(user)">每日消耗 / 明细</Button></TableCell></TableRow><TableRow v-if="!users.records.length"><TableCell :colspan="11" class="py-8 text-center text-muted-foreground">该区间暂无匹配账号的任务记录</TableCell></TableRow></TableBody>
            </Table>
            <UiPagination :current-page="page" :page-size="20" :total="users.total" :show-size-selector="false" :disabled="usersLoading" @current-change="changePage" />
          </template>
        </CardContent>
      </Card>
      <p class="text-muted-foreground text-xs leading-relaxed">统计说明：按当前保留的任务记录及创建时间统计净消耗，包含进行中预扣积分。失败退款会更新对应历史区间的净消耗，已删除任务不包含在内。充值和管理员调账不计入消耗。</p>
    </div>
    <ConsumptionDetails v-if="selected" :user="selected.user" :filter="selected.filter" @close="selected = null" />
  </DsScrollPage>
</template>
