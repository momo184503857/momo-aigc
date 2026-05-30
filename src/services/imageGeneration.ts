/**
 * 统一 AI 生图服务
 *
 * 所有图片生成功能都通过 generateImage() 调用，
 * 内部处理图片上传、请求构建、任务创建、DB 记录。
 */
import type { ModelId } from '@/types/adapter'
import { buildGptImage2Request } from '@/adapter/buildGptImage2Request'
import { buildGeminiRequest } from '@/adapter/buildGeminiRequest'
import { toapisProxyApi } from '@/services/toapisProxyApi'
import { taskApi } from '@/services/taskApi'

export interface GenerateImageParams {
  /** 模型 ID */
  model: ModelId
  /** 最终发送给 API 的完整 prompt（可能包含系统提示词） */
  prompt: string
  /** 用户输入的补充提示词（可为空） */
  userPrompt?: string
  /** 系统提示词（功能模式下有值） */
  systemPrompt?: string
  /** 宽高比，用作 ToAPIs 的 size 参数 */
  size: string
  /** 分辨率 */
  resolution: string
  /** 已上传的图片 URL 列表 */
  imageUrls?: string[]
  /** 待上传的临时图片文件 */
  tempImageFiles?: File[]
  /** 功能 ID（如 'free-gen', 'change-clothes' 等） */
  featureId?: string
  /** 生成数量，默认 1 */
  n?: number
}

export interface GenerateImageResult {
  /** ToAPIs 返回的任务 ID */
  toapisTaskId: string
  /** 本地数据库任务记录 ID */
  dbTaskId: number
  /** 实际发送给 API 的完整图片 URL 列表（包含上传后的临时图片） */
  allImageUrls: string[]
}

/**
 * 统一图片生成函数
 *
 * 验证 → 上传图片 → 创建 ToAPIs 任务 → 创建 DB 记录
 */
export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const {
    model,
    prompt,
    userPrompt,
    systemPrompt,
    size,
    resolution,
    imageUrls = [],
    tempImageFiles = [],
    featureId,
    n = 1,
  } = params

  // ─── 验证：有图片但没有提示词 ───
  const hasImages = imageUrls.length > 0 || tempImageFiles.length > 0
  const hasSystemPrompt = !!(systemPrompt && systemPrompt.trim())
  const finalPrompt = prompt.trim()

  if (hasImages && !finalPrompt && !hasSystemPrompt) {
    throw new Error('请输入提示词，描述你想要生成的效果')
  }

  // ─── 上传临时图片 ───
  const allImageUrls = [...imageUrls]
  for (const file of tempImageFiles) {
    const res = await toapisProxyApi.upload(file)
    allImageUrls.push(res.data.data.url)
  }

  // ─── 构建请求体 ───
  const body = buildRequestBody(model, {
    prompt: finalPrompt,
    size,
    resolution,
    imageUrls: allImageUrls,
  })

  // ─── 创建 ToAPIs 任务 ───
  const taskRes = await toapisProxyApi.createTask(body)
  const toapisTaskId = taskRes.data.data.id

  // ─── 创建 DB 任务记录 ───
  const dbRes = await taskApi.create({
    toapis_task_id: toapisTaskId,
    model,
    prompt: finalPrompt,
    size,
    resolution,
    aspect_ratio: size,
    n,
    input_image_urls: allImageUrls,
    status: 'submitted',
    progress: 0,
    feature_id: featureId,
    user_prompt: userPrompt || '',
  })
  const dbTaskId = dbRes.data.data.id

  return { toapisTaskId, dbTaskId, allImageUrls }
}

/**
 * 根据模型选择请求体构建器
 */
function buildRequestBody(
  model: ModelId,
  params: { prompt: string; size: string; resolution: string; imageUrls: string[] },
): Record<string, unknown> {
  if (model === 'gpt-image-2') {
    return buildGptImage2Request(params)
  }
  return buildGeminiRequest({ model, ...params })
}
