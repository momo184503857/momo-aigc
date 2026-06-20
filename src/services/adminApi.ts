import http from './http'

export const adminApi = {
  // Users
  listUsers(params?: { search?: string; tag?: string }) {
    return http.get('/admin/users', { params })
  },
  getUser(id: number) {
    return http.get(`/admin/users/${id}`)
  },
  createUser(username: string, password: string) {
    return http.post('/admin/users', { username, password })
  },
  updateUser(id: number, data: { username?: string; password?: string; status?: string; role?: string; tags?: string[] }) {
    return http.put(`/admin/users/${id}`, data)
  },
  resetPassword(userId: number, new_password: string) {
    return http.post(`/admin/users/${userId}/reset-password`, { new_password })
  },
  updateUserStatus(userId: number, status: string) {
    return http.patch(`/admin/users/${userId}/status`, { status })
  },
  adjustPoints(userId: number, amount: number, note?: string) {
    return http.post(`/admin/users/${userId}/points`, { amount, note })
  },

  // Tags
  listTags() {
    return http.get('/admin/users/tags')
  },
  createTag(name: string, color?: string) {
    return http.post('/admin/users/tags', { name, color })
  },
  deleteTag(id: number) {
    return http.delete(`/admin/users/tags/${id}`)
  },

  // Tasks
  listTasks(params?: { page?: number; pageSize?: number; status?: string; user_id?: number; start_date?: string; end_date?: string }) {
    return http.get('/admin/tasks', { params })
  },
  deleteTask(id: number) {
    return http.delete(`/admin/tasks/${id}`)
  },

  // 统一活动日志（任务 + 积分流水）
  listActivity(params?: { page?: number; pageSize?: number; user_id?: number; type?: string; status?: string; start_date?: string; end_date?: string }) {
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

  // Points
  listTransactions(params?: { page?: number; pageSize?: number; user_id?: number; reason?: string; start_date?: string; end_date?: string }) {
    return http.get('/admin/points/transactions', { params })
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
