import { computed, onMounted, onUnmounted, ref } from 'vue'
import { adminApi } from '@/services/adminApi'
import type { ConsumptionFilter, ConsumptionGranularity, ConsumptionOverview, ConsumptionPage, ConsumptionSort, ConsumptionUser } from '@/services/consumptionTypes'

export function consumptionDate(value = Date.now()): string {
  return new Date(value + 8 * 3600000).toISOString().slice(0, 10)
}
export function consumptionRange(kind: 'today' | 'week' | 'month' | 'recent'): [string, string] {
  const end = consumptionDate()
  const days = kind === 'week' ? 6 : kind === 'recent' ? 29 : 0
  const start = kind === 'month' ? `${end.slice(0, 7)}-01` : new Date(new Date(`${end}T00:00:00Z`).getTime() - days * 86400000).toISOString().slice(0, 10)
  return [start, end]
}
export function useAdminConsumption() {
  const [start, end] = consumptionRange('recent')
  const startDate = ref(start)
  const endDate = ref(end)
  const search = ref('')
  const applied = ref<ConsumptionFilter>({ start_date: start, end_date: end, search: '' })
  const granularity = ref<ConsumptionGranularity>('day')
  const overview = ref<ConsumptionOverview | null>(null)
  const users = ref<ConsumptionPage<ConsumptionUser> | null>(null)
  const overviewLoading = ref(false)
  const usersLoading = ref(false)
  const overviewError = ref('')
  const usersError = ref('')
  const page = ref(1)
  const sort = ref<ConsumptionSort>('net_consumed')
  const order = ref<'asc' | 'desc'>('desc')
  let overviewVersion = 0
  let usersVersion = 0
  const rangeError = computed(() => !startDate.value || !endDate.value ? '请选择开始和结束日期' : startDate.value > endDate.value ? '开始日期不能晚于结束日期' : '')
  const pendingChanges = computed(() => startDate.value !== applied.value.start_date || endDate.value !== applied.value.end_date || search.value.trim() !== applied.value.search)
  async function loadOverview() {
    const version = ++overviewVersion
    overviewLoading.value = true
    overviewError.value = ''
    try {
      const result = await adminApi.getConsumptionOverview({ ...applied.value, granularity: granularity.value })
      if (version === overviewVersion) overview.value = result
    } catch {
      if (version === overviewVersion) { overview.value = null; overviewError.value = '消耗总览加载失败，请重试' }
    } finally { if (version === overviewVersion) overviewLoading.value = false }
  }
  async function loadUsers() {
    const version = ++usersVersion
    usersLoading.value = true
    usersError.value = ''
    try {
      const result = await adminApi.getConsumptionUsers({ ...applied.value, page: page.value, pageSize: 20, sort: sort.value, order: order.value })
      if (version === usersVersion) users.value = result
    } catch {
      if (version === usersVersion) { users.value = null; usersError.value = '用户统计加载失败，请重试' }
    } finally { if (version === usersVersion) usersLoading.value = false }
  }
  function query() {
    if (rangeError.value) return
    applied.value = { start_date: startDate.value, end_date: endDate.value, search: search.value.trim() }
    page.value = 1
    void loadOverview()
    void loadUsers()
  }
  function quickRange(kind: Parameters<typeof consumptionRange>[0]) { [startDate.value, endDate.value] = consumptionRange(kind) }
  function changePeriod(value: unknown) {
    if (!['day', 'week', 'month'].includes(String(value))) return
    granularity.value = value as ConsumptionGranularity
    void loadOverview()
  }
  function changePage(value: number) { page.value = value; void loadUsers() }
  function changeSort(field: ConsumptionSort, direction: 'asc' | 'desc' | null) {
    sort.value = direction ? field : 'net_consumed'
    order.value = direction ?? 'desc'
    page.value = 1
    void loadUsers()
  }
  onMounted(query)
  onUnmounted(() => { overviewVersion++; usersVersion++ })
  return { startDate, endDate, search, applied, granularity, overview, users, overviewLoading, usersLoading, overviewError, usersError, page, sort, order, rangeError, pendingChanges, loadOverview, loadUsers, query, quickRange, changePeriod, changePage, changeSort }
}
