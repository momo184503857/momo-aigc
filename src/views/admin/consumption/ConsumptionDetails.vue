<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, Button, Skeleton, Table, TableHeader, TableHead, TableRow, TableBody, TableCell, UiPagination, DsStatus, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/design-system'
import { adminApi } from '@/services/adminApi'
import type { ConsumptionFilter, ConsumptionRecords, ConsumptionUser } from '@/services/consumptionTypes'
import { formatCredits } from '@/types/adapter'
import { toBJMinute } from '@/utils/datetime'
import { useModelCatalogStore } from '@/stores/modelCatalog'
const props = defineProps<{ user: ConsumptionUser; filter: ConsumptionFilter }>()
const emit = defineEmits<{ close: [] }>()
const catalog = useModelCatalogStore()
const data = ref<ConsumptionRecords | null>(null)
const page = ref(1)
const activeView = ref('daily')
const loading = ref(false)
const loadError = ref('')
let version = 0
const title = computed(() => `${props.user.nickname || props.user.username} · 消耗明细`)
function taskStatus(status: string): 'done' | 'failed' | 'pending' | 'running' | 'cancelled' {
  return status === 'completed' ? 'done' : status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : status === 'running' || status === 'processing' ? 'running' : 'pending'
}
async function load(nextPage = page.value) {
  page.value = nextPage
  const current = ++version
  loading.value = true
  loadError.value = ''
  try {
    const result = await adminApi.getConsumptionRecords({ start_date: props.filter.start_date, end_date: props.filter.end_date, user_id: props.user.user_id, page: page.value, pageSize: 20 })
    if (current === version) data.value = result
  } catch { if (current === version) { data.value = null; loadError.value = '消耗明细加载失败，请重试' } }
  finally { if (current === version) loading.value = false }
}
onMounted(() => load())
onUnmounted(() => { version++ })
</script>
<template>
  <Sheet :open="true" @update:open="!$event && emit('close')">
    <SheetContent class="w-full sm:max-w-3xl">
      <SheetHeader>
        <SheetTitle>{{ title }}</SheetTitle>
        <SheetDescription>{{ user.username }} · {{ filter.start_date }} 至 {{ filter.end_date }}（北京时间）</SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-4" :aria-busy="loading">
        <template v-if="loading"><Skeleton class="h-16 w-full" /><Skeleton class="h-64 w-full" /><p class="sr-only" role="status">正在加载消耗明细</p></template>
        <div v-else-if="loadError" role="alert" class="space-y-3"><p>{{ loadError }}</p><Button variant="outline" @click="load()">重试明细</Button></div>
        <template v-else-if="data">
          <div class="space-y-1"><p class="text-muted-foreground text-sm">区间净消耗</p><p class="text-2xl font-semibold tabular-nums">{{ formatCredits(data.net_consumed) }}</p></div>
          <Tabs v-model="activeView">
            <TabsList aria-label="用户消耗视图">
              <TabsTrigger value="daily">每日消耗</TabsTrigger>
              <TabsTrigger value="tasks">任务明细</TabsTrigger>
            </TabsList>
            <TabsContent value="daily" class="space-y-3">
              <p class="text-muted-foreground text-sm">按北京时间逐日统计，包含没有消耗的日期。</p>
              <Table aria-label="用户每日积分消耗">
                <TableHeader>
                  <TableRow><TableHead>日期（北京时间）</TableHead><TableHead class="text-right">消耗积分</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="day in data.daily" :key="day.date">
                    <TableCell>{{ day.date }}</TableCell>
                    <TableCell class="text-right tabular-nums">{{ formatCredits(day.net_consumed) }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="tasks" class="space-y-3">
          <Table aria-label="用户消耗任务明细">
            <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>任务号</TableHead><TableHead>模型</TableHead><TableHead>状态</TableHead><TableHead class="text-right">净消耗积分</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow v-for="record in data.records" :key="record.id">
                <TableCell class="whitespace-nowrap">{{ toBJMinute(record.created_at) }}</TableCell><TableCell>{{ record.task_no || `#${record.id}` }}</TableCell><TableCell>{{ catalog.displayNameFor(record.model) || record.model }}</TableCell><TableCell><DsStatus :status="taskStatus(record.status)" /></TableCell><TableCell class="text-right tabular-nums">{{ formatCredits(record.net_consumed) }}</TableCell>
              </TableRow>
              <TableRow v-if="!data.records.length"><TableCell :colspan="5" class="text-center">该区间暂无任务记录</TableCell></TableRow>
            </TableBody>
          </Table>
          <UiPagination :current-page="page" :page-size="20" :total="data.total" :show-size-selector="false" :disabled="loading" @current-change="load" />
            </TabsContent>
          </Tabs>
          <p class="text-muted-foreground text-xs">失败退款后净消耗为0；进行中任务显示当前预扣积分。</p>
        </template>
      </div>
    </SheetContent>
  </Sheet>
</template>
