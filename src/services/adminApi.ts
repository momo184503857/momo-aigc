import http from './http'

export const adminApi = {
  // Users
  listUsers() {
    return http.get('/admin/users')
  },
  createUser(username: string, password: string) {
    return http.post('/admin/users', { username, password })
  },
  resetPassword(userId: number, new_password: string) {
    return http.post(`/admin/users/${userId}/reset-password`, { new_password })
  },
  updateUserStatus(userId: number, status: string) {
    return http.patch(`/admin/users/${userId}/status`, { status })
  },

  // Tasks
  listTasks(params?: { page?: number; pageSize?: number; status?: string; user_id?: number }) {
    return http.get('/admin/tasks', { params })
  },
  deleteTask(id: number) {
    return http.delete(`/admin/tasks/${id}`)
  },

  // Templates
  listTemplates(user_id?: number) {
    return http.get('/admin/templates', { params: user_id ? { user_id } : {} })
  },
  deleteTemplate(id: number) {
    return http.delete(`/admin/templates/${id}`)
  },

  // Stats
  getStats() {
    return http.get('/admin/stats/users')
  },
}
