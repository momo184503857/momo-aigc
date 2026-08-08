import http from './http'

export const adminApi = {
  // Users
  listUsers(params?: { search?: string; sort?: string; order?: 'asc' | 'desc' }) {
    return http.get('/admin/users', { params })
  },
  createUser(username: string, password: string) {
    return http.post('/admin/users', { username, password })
  },
  updateUser(id: number, data: { status?: string; role?: string }) {
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
