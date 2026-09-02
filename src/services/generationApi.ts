import http from './http'

/**
 * 生图编排 API（ai-provider 重构）。
 * 服务端统一编排：提交（校验/计价预扣/落库/派发）→ 轮询（查上游/转存 OSS/失败退款）。
 * 前端不再直调任何上游渠道，转存由服务端完成。
 */

export interface GenerationSubmitParams {
  /** 逻辑模型 id；服务端按成本自动选择渠道 */
  logicalModelId: number
  prompt: string
  userPrompt?: string
  systemPrompt?: string
  aspectRatio: string
  resolution: string
  /** 生成数量（服务端拆成多条任务） */
  n?: number
  /** 参考图（前端已上传 OSS 的 URL） */
  refImageUrls?: string[]
  templateImageIds?: number[]
  featureId?: string
  supplementaryImages?: { name: string; url: string }[]
  promptSegments?: Record<string, string>
  negativePrompt?: string
  suiteId?: number
  pointIndex?: number
  clientBusinessId?: string
}

export interface GenerationSubmitResult {
  tasks: Array<{ id: number; taskNo: string; status: string }>
  inputImageUrls: string[]
}

export interface GenerationStatus {
  status: string
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  expiresAt?: string
  taskNo?: string
  /** 渠道侧任务号（异步渠道如 toapis 才有） */
  providerTaskId?: string | null
  completedAt?: string
}

export interface GenerationTaskRecord {
  id: number
  task_no?: string
  taskNo?: string
  /** 渠道侧任务号（异步渠道如 toapis 才有） */
  provider_task_id?: string | null
  model: string
  prompt: string
  resolution?: string | null
  aspect_ratio?: string | null
  aspectRatio?: string | null
  status: string
  progress?: number | null
  result_image_urls?: string[]
  input_image_urls?: string[]
  error_message?: string | null
  feature_id?: string | null
  user_prompt?: string
  supplementaryImages?: { name: string; url: string }[]
  created_at: string
  completed_at?: string | null
  channelProviderName?: string | null
  channelModelName?: string | null
  logicalCode?: string | null
  points_cost?: number
  [key: string]: unknown
}

export const generationApi = {
  /** 提交生成任务（n>1 服务端返回多条任务） */
  submit(params: GenerationSubmitParams): Promise<{ data: { success: boolean; data: GenerationSubmitResult; error?: string } }> {
    return http.post('/generations', params, { timeout: 90000 })
  },

  /** 单次任务状态查询（服务端查上游 + 转存） */
  getStatus(taskId: number | string): Promise<{ data: { success: boolean; data: GenerationStatus } }> {
    return http.get(`/generations/${taskId}/status`)
  },

  /** 已完成但转存失败的任务重跑转存 */
  reimport(taskId: number | string): Promise<{ data: { success: boolean; data: { resultUrls: string[] } } }> {
    return http.post(`/generations/${taskId}/reimport`)
  },

  /** 任务列表（过滤参数兼容旧 /api/tasks） */
  list(params?: {
    page?: number
    pageSize?: number
    status?: string
    model?: string
    feature_id?: string
    suiteId?: number
    start_date?: string
    end_date?: string
  }): Promise<{ data: { data: { records: GenerationTaskRecord[]; total: number; page: number; pageSize: number } } }> {
    return http.get('/generations', { params })
  },
}
