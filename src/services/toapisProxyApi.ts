import http from './http'

export const toapisProxyApi = {
  health(): Promise<{ data: { success: boolean; data: {
    sharedKeyConfigured: boolean
    personalKeyConfigured: boolean
    personalKeyActive: boolean
    balanceCheckIntervalSec: number
  } } }> {
    return http.get('/toapis/health')
  },

  upload(file: File): Promise<{ data: { data: { url: string } } }> {
    const formData = new FormData()
    formData.append('file', file)
    return http.post('/toapis/upload', formData)
  },

  createTask(body: Record<string, unknown>): Promise<{ data: { data: { id: string } } }> {
    // 上游创建含参考图的任务时可能同步预处理较久，超时放宽到 60s；
    // 若沿用全局 15s 超时，会在上游已建任务后误判失败，重试导致重复扣费任务
    return http.post('/toapis/create-task', body, { timeout: 60000 })
  },

  getTaskStatus(taskId: string): Promise<{ data: { data: {
    status: string
    progress: number
    resultUrls: string[]
    errorMessage?: string
    errorCode?: string
    expiresAt?: string
  } } }> {
    return http.get(`/toapis/task-status/${taskId}`)
  },
}
