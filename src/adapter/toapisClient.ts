/**
 * ToAPIs 客户端 — 共享模式
 *
 * 走服务器代理，使用管理员配置的共享 Key
 */

import type { ModelId } from '@/types/adapter'
import { buildGptImage2Request } from './buildGptImage2Request'
import { buildGeminiRequest } from './buildGeminiRequest'
import { translateError } from '@/utils/errors'
import { toapisProxyApi } from '@/services/toapisProxyApi'
import { ossApi } from '@/services/ossApi'

export interface CreateTaskParams {
  model: ModelId
  prompt: string
  size: string
  resolution: string
  imageUrls: string[]
}

export interface ToapisStatusResponse {
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress?: number
  error?: { message?: string; code?: string }
  result?: {
    data?: Array<{ url: string }>
  }
  expires_at?: string
}

export interface TaskStatusResult {
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  expiresAt?: string
}

function buildRequestBody(model: ModelId, params: CreateTaskParams): Record<string, unknown> {
  if (model === 'gpt-image-2') {
    return buildGptImage2Request({
      prompt: params.prompt,
      size: params.size,
      resolution: params.resolution,
      imageUrls: params.imageUrls,
    })
  } else {
    return buildGeminiRequest({
      model,
      prompt: params.prompt,
      size: params.size,
      resolution: params.resolution,
      imageUrls: params.imageUrls,
    })
  }
}

/**
 * 上传图片到 ToAPIs
 */
export async function uploadImage(file: File): Promise<string> {
  const res = await ossApi.upload(file, 'inputs')
  return res.publicUrl
}

/**
 * 创建图像生成任务
 */
export async function createTask(params: CreateTaskParams): Promise<string> {
  const body = buildRequestBody(params.model, params)
  const res = await toapisProxyApi.createTask(body)
  return res.data.data.id
}

/**
 * 查询任务状态
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatusResult> {
  const res = await toapisProxyApi.getTaskStatus(taskId)
  const data = res.data.data
  const result: TaskStatusResult = {
    status: data.status as 'queued' | 'in_progress' | 'completed' | 'failed',
    progress: data.progress,
    resultUrls: data.resultUrls,
    expiresAt: data.expiresAt,
  }
  if (data.status === 'failed') {
    result.errorMessage = data.errorMessage || '未知错误'
    result.errorCode = data.errorCode
  }
  return result
}
