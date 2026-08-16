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
  user_prompt?: string
  supplementary_images?: { name: string; url: string }[]
  prompt_segments?: Record<string, string>
  negative_prompt?: string
  /** 所属套系（suite-gen） */
  suite_id?: number
  /** 套系内点位序号 0-4 */
  point_index?: number
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
  list(params?: { page?: number; pageSize?: number; status?: string; model?: string; feature_id?: string; start_date?: string; end_date?: string; suiteId?: number }) {
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
