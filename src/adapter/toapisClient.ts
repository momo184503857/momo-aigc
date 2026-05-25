/**
 * ToAPIs 浏览器客户端
 *
 * 所有请求从浏览器直接发到 ToAPIs，使用用户本地保存的 API Key。
 * 浏览器无 Node.js 依赖，使用 fetch() + FormData。
 */

import type { ModelId } from '@/types/adapter'
import { buildGptImage2Request } from './buildGptImage2Request'
import { buildGeminiRequest } from './buildGeminiRequest'
import { translateError } from '@/utils/errors'

const BASE_URL = 'https://toapis.com'

export interface CreateTaskParams {
  model: ModelId
  prompt: string
  size: string
  resolution: string
  imageUrls: string[]
}

export interface ToapisTaskResponse {
  id: string
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

function authHeader(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
  }
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
export async function uploadImage(apiKey: string, file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${BASE_URL}/v1/uploads/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(translateError({ status: res.status, message: err.message || err.error?.message }))
  }

  const data = await res.json()
  if (!data.success || !data.data?.url) {
    throw new Error(translateError('上传响应中缺少图片 URL'))
  }

  return data.data.url
}

/**
 * 创建图像生成任务
 * 根据模型类型构建不同的请求体（GPT-Image-2 vs Gemini）
 */
export async function createTask(apiKey: string, params: CreateTaskParams): Promise<string> {
  const body = buildRequestBody(params.model, params)

  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(translateError({ status: res.status, message: data.message || data.error?.message }))
  }

  if (!data.id) {
    throw new Error(translateError('创建任务响应中缺少 task ID'))
  }

  return data.id
}

/**
 * 查询任务状态
 */
export async function getTaskStatus(
  apiKey: string,
  taskId: string
): Promise<TaskStatusResult> {
  const res = await fetch(`${BASE_URL}/v1/images/generations/${taskId}`, {
    method: 'GET',
    headers: authHeader(apiKey),
  })

  const data: ToapisStatusResponse = await res.json()

  if (!res.ok) {
    throw new Error(translateError({ status: res.status, message: data.error?.message }))
  }

  const result: TaskStatusResult = {
    status: data.status,
    progress: data.progress ?? 0,
    resultUrls: (data.result?.data || []).map((img) => img.url),
    expiresAt: data.expires_at,
  }

  if (data.status === 'failed') {
    result.errorMessage = data.error?.message || '未知错误'
    result.errorCode = data.error?.code
  }

  return result
}

/**
 * 测试 API Key 是否有效
 */
export async function testConnection(apiKey: string): Promise<boolean> {
  try {
    // 用模型列表接口测试连通性
    const res = await fetch(`${BASE_URL}/v1/models`, {
      headers: authHeader(apiKey),
    })
    return res.ok
  } catch {
    return false
  }
}
