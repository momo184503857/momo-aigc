import http from './http'
import type { ConsumptionFilter, ConsumptionOverview, ConsumptionPage, ConsumptionUser, ConsumptionUsersQuery, ConsumptionRecords, ConsumptionRecordsQuery } from './consumptionTypes'

export const adminApi = {
  // Users
  listUsers(params?: { page?: number; pageSize?: number; search?: string; sort?: string; order?: 'asc' | 'desc'; status?: string }) {
    return http.get('/admin/users', { params })
  },
  createUser(username: string, password: string) {
    return http.post('/admin/users', { username, password })
  },
  updateUser(id: number, data: { status?: string; role?: string; note?: string }) {
    return http.put(`/admin/users/${id}`, data)
  },
  updateUserStatus(userId: number, status: string) {
    return http.patch(`/admin/users/${userId}/status`, { status })
  },
  adjustPoints(userId: number, amount: number, note?: string) {
    return http.post(`/admin/users/${userId}/points`, { amount, note })
  },

  // Tasks
  listTasks(params?: { page?: number; pageSize?: number; status?: string; user_id?: number; start_date?: string; end_date?: string }) {
    return http.get('/admin/tasks', { params })
  },
  deleteTask(id: number) {
    return http.delete(`/admin/tasks/${id}`)
  },

  // 统一活动日志（任务 + 积分流水）
  listActivity(params?: { page?: number; pageSize?: number; user?: string; task_id?: string; type?: string; status?: string; start_date?: string; end_date?: string }) {
    return http.get('/admin/activity', { params })
  },

  // Templates
  listTemplates(user_id?: number) {
    return http.get('/admin/templates', { params: user_id ? { user_id } : {} })
  },
  deleteTemplate(id: number) {
    return http.delete(`/admin/templates/${id}`)
  },

  // 独立用户消耗统计（保持旧统计接口行为）
  async getConsumptionOverview(params: ConsumptionFilter): Promise<ConsumptionOverview> {
    const { data } = await http.get<{ success: boolean; data: ConsumptionOverview }>('/admin/stats/consumption/overview', { params })
    return data.data
  },
  async getConsumptionUsers(params: ConsumptionUsersQuery): Promise<ConsumptionPage<ConsumptionUser>> {
    const { data } = await http.get<{ success: boolean; data: ConsumptionPage<ConsumptionUser> }>('/admin/stats/consumption/users', { params })
    return data.data
  },
  async getConsumptionRecords(params: ConsumptionRecordsQuery): Promise<ConsumptionRecords> {
    const { data } = await http.get<{ success: boolean; data: ConsumptionRecords }>('/admin/stats/consumption/records', { params })
    return data.data
  },

  // Stats
  getStats(params?: { start_date?: string; end_date?: string; user_id?: number }) {
    return http.get('/admin/stats/users', { params })
  },
  getDailyStats(params?: { start_date?: string; end_date?: string; user_id?: number; granularity?: string }) {
    return http.get('/admin/stats/daily', { params })
  },
  getTrends(days?: number) {
    return http.get('/admin/stats/trends', { params: days ? { days } : {} })
  },
  getStatsSummary(params?: { start_date?: string; end_date?: string; user_id?: number }) {
    return http.get('/admin/stats/summary', { params })
  },

  // ToAPIs balance
  getToApisBalance() {
    return http.get('/admin/toapis/balance')
  },
  getToApisUserBalance() {
    return http.get('/admin/toapis/user-balance')
  },
  getToApisBalanceHistory() {
    return http.get('/admin/toapis/balance/history')
  },
}
