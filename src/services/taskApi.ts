import http from './http'

export interface CreateTaskParams {
  toapis_task_id: string
  client_business_id?: string
  model: string
  prompt: string
  size?: string
  resolution?: string
  aspect_ratio?: string
  n?: number
  template_image_ids?: number[]
  input_image_urls?: string[]
  status?: string
  progress?: number
  feature_id?: string
}

export interface UpdateTaskParams {
  status?: string
  progress?: number
  result_image_urls?: string[]
  error_code?: string
  error_message?: string
  raw_error?: any
  completed_at?: string
  expires_at?: string
}

export const taskApi = {
  list(params?: { page?: number; pageSize?: number; status?: string; model?: string }) {
    return http.get('/tasks', { params })
  },
  get(id: number) {
    return http.get(`/tasks/${id}`)
  },
  create(data: CreateTaskParams) {
    return http.post('/tasks', data)
  },
  update(id: number, data: UpdateTaskParams) {
    return http.patch(`/tasks/${id}`, data)
  },
  delete(id: number) {
    return http.delete(`/tasks/${id}`)
  },
}
