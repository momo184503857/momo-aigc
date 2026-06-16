import http from './http'

export interface UserKeyConfig {
  hasPersonalKey: boolean
  keyHint: string
  usePersonalKey: boolean
  sharedKeyConfigured: boolean
  balanceCheckIntervalSec: number
}

export const userKeyApi = {
  getKeyConfig(): Promise<{ data: { success: boolean; data: UserKeyConfig } }> {
    return http.get('/me/toapis/key-config')
  },

  saveKey(
    apiKey: string,
    balanceCheckIntervalSec?: number,
  ): Promise<{ data: { success: boolean; data: { hasPersonalKey: boolean; keyHint: string; sharedKeyConfigured: boolean; balanceCheckIntervalSec: number } } }> {
    return http.put('/me/toapis/key', { apiKey, balanceCheckIntervalSec })
  },

  setMode(usePersonalKey: boolean): Promise<{ data: { success: boolean; data: { usePersonalKey: boolean } } }> {
    return http.patch('/me/toapis/key-mode', { usePersonalKey })
  },

  // 单独更新个人 Key 余额轮询间隔（秒；0 = 不查询）
  setBalanceInterval(intervalSec: number): Promise<{ data: { success: boolean; data: { balanceCheckIntervalSec: number }; error?: string } }> {
    return http.patch('/me/toapis/balance-interval', { intervalSec })
  },

  deleteKey(): Promise<{ data: { success: boolean; data: { usePersonalKey: boolean } } }> {
    return http.delete('/me/toapis/key')
  },

  test(apiKey: string): Promise<{ data: { success: boolean; data: { ok: boolean; error?: string } } }> {
    return http.post('/me/toapis/test', { apiKey })
  },

  getBalance(): Promise<{ data: { success: boolean; data: { balance: number; credits: number; currency: string }; error?: string } }> {
    return http.get('/me/toapis/balance')
  },
}
