export type ConsumptionGranularity = 'day' | 'week' | 'month'
export type ConsumptionSort = 'net_consumed' | 'submitted_count'
export interface ConsumptionFilter {
  start_date: string
  end_date: string
  search?: string
  granularity?: ConsumptionGranularity
}
export interface ConsumptionSummary {
  net_consumed: number
  consuming_users: number
  submitted_count: number
  in_progress_credits: number
}
export interface ConsumptionOverview {
  summary: ConsumptionSummary
  trend: { date: string; net_consumed: number }[]
}
export interface ConsumptionUser {
  user_id: number
  username: string
  nickname: string | null
  role: string
  status: string
  current_balance: number
  net_consumed: number
  submitted_count: number
  completed_count: number
  failed_count: number
  last_submitted_at: string
}
export interface ConsumptionRecord {
  id: number
  task_no: string | null
  created_at: string
  model: string
  status: string
  net_consumed: number
}
export interface ConsumptionPage<T> { records: T[]; total: number; page: number; pageSize: number }
export interface ConsumptionRecords extends ConsumptionPage<ConsumptionRecord> {
  daily: { date: string; net_consumed: number }[]
  user: Pick<ConsumptionUser, 'user_id' | 'username' | 'nickname' | 'role' | 'status'>
  net_consumed: number
}
export interface ConsumptionUsersQuery extends ConsumptionFilter {
  page?: number
  pageSize?: number
  sort?: ConsumptionSort
  order?: 'asc' | 'desc'
}
export interface ConsumptionRecordsQuery {
  start_date: string
  end_date: string
  user_id: number
  page?: number
  pageSize?: number
}
