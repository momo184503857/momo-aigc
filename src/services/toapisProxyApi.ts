import http from './http'

export const toapisProxyApi = {
  health(): Promise<{ data: { success: boolean; data: {
    sharedKeyConfigured: boolean
    personalKeyConfigured: boolean
    personalKeyActive: boolean
  } } }> {
    return http.get('/toapis/health')
  },

  upload(file: File): Promise<{ data: { data: { url: string } } }> {
    const formData = new FormData()
    formData.append('file', file)
    return http.post('/toapis/upload', formData)
  },

  createTask(body: Record<string, unknown>): Promise<{ data: { data: { id: string } } }> {
    return http.post('/toapis/create-task', body)
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
