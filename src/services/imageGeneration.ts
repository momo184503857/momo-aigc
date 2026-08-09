/**
 * 统一 AI 生图服务 — 高内聚低耦合设计
 *
 * 提供三层 API：
 * 1. 分步函数：submitTask / pollTask / importResultUrls（灵活组合）
 * 2. 高层封装：generateImage({ poll, import })（一键调用）
 * 3. 零 UI 依赖，纯数据和流程
 */
import type { ModelId } from '@/types/adapter'
import { buildGptImage2Request } from '@/adapter/buildGptImage2Request'
import { buildGeminiRequest } from '@/adapter/buildGeminiRequest'
import { toapisProxyApi } from '@/services/toapisProxyApi'
import { taskApi } from '@/services/taskApi'
import { ossApi } from '@/services/ossApi'

// ─── Types ───

export interface SubmitTaskParams {
  /** 模型 ID */
  model: ModelId
  /** 最终发送给 API 的完整 prompt */
  prompt: string
  /** 用户输入的补充提示词（可为空） */
  userPrompt?: string
  /** 系统提示词（功能模式下有值） */
  systemPrompt?: string
  /** 宽高比，用作 ToAPIs 的 size 参数 */
  size: string
  /** 分辨率 */
  resolution: string
  /**
   * 有序参考图列表（推荐），保持用户拖拽排序后的顺序。
   * 每项可以是已上传的 URL，也可以是待上传的本地文件。
   */
  refImages?: Array<{ url?: string; file?: File }>
  /** 功能 ID（如 'free-gen', 'change-clothes' 等） */
  featureId?: string
  /** 生成数量，默认 1 */
  n?: number
  /** 补充图片列表（带名称） */
  supplementaryImages?: { name: string; url: string }[]
  /** 结构化提示词字段快照（来自提示词工坊） */
  promptSegments?: Record<string, string>
  /** 负向规避词（自然语言追加） */
  negativePrompt?: string
}

export interface SubmitTaskResult {
  /** ToAPIs 返回的任务 ID */
  toapisTaskId: string
  /** 本地数据库任务记录 ID */
  dbTaskId: number
  /** 实际发送给 API 的完整图片 URL 列表（包含上传后的临时图片） */
  inputImageUrls: string[]
}

export interface PollTaskOptions {
  /** 轮询间隔（毫秒），默认 4000 */
  interval?: number
  /** 最大轮询次数，默认 150（约 10 分钟） */
  maxAttempts?: number
  /** 最大超时时间（毫秒），默认 600000（10 分钟） */
  timeout?: number
}

export interface PollTaskResult {
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  expiresAt?: string
}

export interface GenerateImageOptions {
  /** 是否自动轮询，可配置轮询参数，默认 false */
  poll?: boolean | PollTaskOptions
  /** 是否自动转存结果到 OSS，默认 false */
  import?: boolean
}

export interface GenerateImageResult extends SubmitTaskResult {
  /** 轮询结果（仅当 poll=true 时有值） */
  pollResult?: PollTaskResult
  /** 结果图 OSS URL（仅当 import=true 时有值） */
  resultUrls?: string[]
}

// ─── Helper Functions ───

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

/**
 * 处理单个 URL：OSS URL 直接加入，非 OSS URL 下载后上传，data URL 转 File 上传
 */
async function processUrl(url: string, allImageUrls: string[]): Promise<void> {
  if (url.includes('oss-cn-hangzhou.aliyuncs.com')) {
    allImageUrls.push(url)
  } else if (url.startsWith('data:')) {
    // data URL（base64）→ 转 File 后上传到 OSS
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const file = new File([blob], 'ref-image.png', { type: blob.type || 'image/png' })
      const uploaded = await ossApi.upload(file, 'inputs')
      allImageUrls.push(uploaded.publicUrl)
    } catch (err) {
      console.warn('[ImageGen] Failed to upload data URL:', err)
      allImageUrls.push(url)
    }
  } else if (url.startsWith('http')) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const file = new File([blob], 'ref-image.png', { type: blob.type || 'image/png' })
      const uploaded = await ossApi.upload(file, 'inputs')
      allImageUrls.push(uploaded.publicUrl)
    } catch (err) {
      console.warn('[ImageGen] Failed to re-upload non-OSS URL, using original:', url, err)
      allImageUrls.push(url)
    }
  } else {
    allImageUrls.push(url)
  }
}

/**
 * 上传本地文件到 OSS
 */
async function processFile(file: File, allImageUrls: string[]): Promise<void> {
  const uploaded = await ossApi.upload(file, 'inputs')
  allImageUrls.push(uploaded.publicUrl)
}

// ─── Step Functions ───

/**
 * 提交任务（上传图片 + 创建 ToAPIs 任务 + 写入 DB）
 *
 * @param params 任务参数
 * @returns 任务 ID 和输入图片 URL 列表
 */
export async function submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
  const {
    model,
    prompt,
    userPrompt,
    systemPrompt,
    size,
    resolution,
    refImages,
    featureId,
    n = 1,
    supplementaryImages,
    promptSegments,
    negativePrompt,
  } = params

  // ─── 验证：有图片但没有提示词 ───
  const hasImages = (refImages?.length ?? 0) > 0
  const hasSystemPrompt = !!(systemPrompt && systemPrompt.trim())
  const finalPrompt = prompt.trim()

  if (hasImages && !finalPrompt && !hasSystemPrompt) {
    throw new Error('请输入提示词，描述你想要生成的效果')
  }

  // ─── 上传图片 ───
  const allImageUrls: string[] = []

  if (refImages && refImages.length > 0) {
    for (const ref of refImages) {
      if (ref.url) {
        await processUrl(ref.url, allImageUrls)
      } else if (ref.file) {
        await processFile(ref.file, allImageUrls)
      }
    }
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
    supplementary_images: supplementaryImages || [],
    prompt_segments: promptSegments || {},
    negative_prompt: negativePrompt || '',
  })
  const dbTaskId = dbRes.data.data.id

  return { toapisTaskId, dbTaskId, inputImageUrls: allImageUrls }
}

/**
 * 轮询任务状态（阻塞式，返回纯数据）
 *
 * @param taskId ToAPIs 任务 ID
 * @param options 轮询配置
 * @returns 任务状态和结果
 */
export async function pollTask(
  taskId: string,
  options?: PollTaskOptions,
): Promise<PollTaskResult> {
  const interval = options?.interval ?? 4000
  const maxAttempts = options?.maxAttempts ?? 150
  const timeout = options?.timeout ?? 600000

  const startTime = Date.now()
  let attempts = 0

  while (attempts < maxAttempts && Date.now() - startTime < timeout) {
    attempts++

    try {
      const res = await toapisProxyApi.getTaskStatus(taskId)
      const data = res.data.data

      const result: PollTaskResult = {
        status: data.status as 'queued' | 'in_progress' | 'completed' | 'failed',
        progress: data.progress ?? 0,
        resultUrls: data.resultUrls ?? [],
        expiresAt: data.expiresAt,
      }

      if (result.status === 'completed') {
        return result
      }

      if (result.status === 'failed') {
        result.errorMessage = data.errorMessage || '生成失败'
        result.errorCode = data.errorCode
        return result
      }

      // 等待下次轮询
      await new Promise((resolve) => setTimeout(resolve, interval))
    } catch (err) {
      // 单次请求失败，继续轮询
      console.warn('[pollTask] Request failed:', err)
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }

  // 超时返回
  return {
    status: 'failed',
    progress: 0,
    resultUrls: [],
    errorMessage: attempts >= maxAttempts ? '轮询次数超限' : '轮询超时',
  }
}

/**
 * 转存结果图到 OSS（统一函数，容错：单张失败不影响其他张）
 *
 * @param taskId ToAPIs 任务 ID
 * @param sourceUrls 结果图原始 URL 列表
 * @returns 成功转存的 OSS URL 列表（失败的会被跳过）
 */
export async function importResultUrls(
  taskId: string,
  sourceUrls: string[],
): Promise<string[]> {
  const importedUrls: string[] = []
  for (const sourceUrl of sourceUrls) {
    try {
      const imported = await ossApi.importResult(taskId, sourceUrl)
      console.info('[OSS] Result imported', {
        taskId,
        sizeBytes: imported.sizeBytes,
        sourceConnectedMs: imported.sourceConnectedMs,
        totalMs: imported.totalMs,
      })
      importedUrls.push(imported.publicUrl)
    } catch (err) {
      // 单张转存失败不中断，继续转存其他张
      console.warn('[OSS] importResult failed, skipping:', sourceUrl, err)
    }
  }
  return importedUrls
}

// ─── High-Level Wrapper ───

/**
 * 统一图片生成函数（高层封装）
 *
 * 支持一键调用或分步控制：
 * - generateImage(params) — 只提交任务
 * - generateImage(params, { poll: true }) — 提交 + 轮询
 * - generateImage(params, { poll: true, import: true }) — 提交 + 轮询 + 转存
 *
 * @param params 任务参数
 * @param options 配置选项
 * @returns 任务结果
 */
export async function generateImage(
  params: SubmitTaskParams,
  options?: GenerateImageOptions,
): Promise<GenerateImageResult> {
  // 提交任务
  const submitResult = await submitTask(params)
  const result: GenerateImageResult = submitResult

  // 是否轮询
  const shouldPoll = options?.poll
  if (shouldPoll) {
    const pollOptions: PollTaskOptions =
      typeof shouldPoll === 'boolean' ? {} : shouldPoll

    result.pollResult = await pollTask(submitResult.toapisTaskId, pollOptions)

    if (result.pollResult.status === 'completed') {
      // 只要轮询完成，就更新 DB 为终态 completed（避免孤立 submitted）
      // import 只决定是否同时转存结果图
      const update: Parameters<typeof taskApi.update>[1] = {
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        expires_at: result.pollResult.expiresAt,
      }
      if (options?.import) {
        result.resultUrls = await importResultUrls(
          submitResult.toapisTaskId,
          result.pollResult.resultUrls,
        )
        update.result_image_urls = result.resultUrls
      }
      await taskApi.update(submitResult.dbTaskId, update)
    } else {
      // 轮询失败/超时 → 标记 DB 任务为失败，避免遗留孤立的 submitted 记录
      await taskApi.update(submitResult.dbTaskId, {
        status: 'failed',
        progress: result.pollResult.progress,
        error_message: result.pollResult.errorMessage || '生成失败',
        error_code: result.pollResult.errorCode,
      }).catch((err) => {
        console.warn('[generateImage] Failed to mark DB task as failed:', err)
      })
    }
  }

  return result
}

// ─── Legacy Exports (for backward compatibility) ───

// 保留旧的 GenerateImageParams 类型名（实际是 SubmitTaskParams）
export type GenerateImageParams = SubmitTaskParams
