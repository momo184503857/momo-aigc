import http from './http'

export interface UserKeyConfig {
  hasPersonalKey: boolean
  keyHint: string
  usePersonalKey: boolean
  sharedKeyConfigured: boolean
}

export const userKeyApi = {
  getKeyConfig(): Promise<{ data: { success: boolean; data: UserKeyConfig } }> {
    return http.get('/me/toapis/key-config')
  },

  saveKey(apiKey: string): Promise<{ data: { success: boolean; data: { hasPersonalKey: boolean; keyHint: string; sharedKeyConfigured: boolean } } }> {
    return http.put('/me/toapis/key', { apiKey })
  },

  setMode(usePersonalKey: boolean): Promise<{ data: { success: boolean; data: { usePersonalKey: boolean } } }> {
    return http.patch('/me/toapis/key-mode', { usePersonalKey })
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
