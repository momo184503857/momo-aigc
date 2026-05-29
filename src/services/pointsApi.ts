import http from './http'

export const pointsApi = {
  getMyBalance() {
    return http.get('/points/me')
  },
  getMyTransactions(page = 1, pageSize = 20) {
    return http.get('/points/me/transactions', { params: { page, pageSize } })
  },
}
