import http from './http'

export const pointsApi = {
  getMyBalance() {
    return http.get('/points/me')
  },
  getMyTransactions(page = 1, pageSize = 20) {
    return http.get('/points/me/transactions', { params: { page, pageSize } })
  },
  getMyDailyStats(params?: { granularity?: string; start_date?: string; end_date?: string }) {
    return http.get('/points/me/daily', { params })
  },
  getMyQuota() {
    return http.get('/me/quota')
  },
}
