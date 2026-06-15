/**
 * ToAPIs 客户端 — 共享模式
 *
 * 走服务器代理，使用管理员配置的共享 Key
 * 单一职责：API 调用封装，不包含业务逻辑
 */

import { toapisProxyApi } from '@/services/toapisProxyApi'
import { ossApi } from '@/services/ossApi'

export interface TaskStatusResult {
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  expiresAt?: string
}

/**
 * 上传图片到 OSS
 *
 * @param file 本地文件
 * @returns OSS 公开 URL
 */
export async function uploadImage(file: File): Promise<string> {
  const res = await ossApi.upload(file, 'inputs')
  return res.publicUrl
}

/**
 * 创建图像生成任务（直接接受请求体）
 *
 * 注意：此函数不构建请求体，调用方需要使用 buildGptImage2Request 或 buildGeminiRequest 构建
 * 推荐：使用 imageGeneration.submitTask() 自动处理请求体构建
 *
 * @param body 已构建的请求体
 * @returns ToAPIs 任务 ID
 */
export async function createTask(body: Record<string, unknown>): Promise<string> {
  const res = await toapisProxyApi.createTask(body)
  return res.data.data.id
}

/**
 * 查询任务状态
 *
 * @param taskId ToAPIs 任务 ID
 * @returns 任务状态和结果
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatusResult> {
  const res = await toapisProxyApi.getTaskStatus(taskId)
  const data = res.data.data

  const result: TaskStatusResult = {
    status: data.status as 'queued' | 'in_progress' | 'completed' | 'failed',
    progress: data.progress ?? 0,
    resultUrls: data.resultUrls ?? [],
    expiresAt: data.expiresAt,
  }

  if (data.status === 'failed') {
    result.errorMessage = data.errorMessage || '未知错误'
    result.errorCode = data.errorCode
  }

  return result
}
