/**
 * 统一 AI 生图服务 — ai-provider 重构版（服务端编排）
 *
 * 提供三层 API：
 * 1. 分步函数：submitTask / pollTask（灵活组合）
 * 2. 高层封装：generateImage({ poll })（一键调用）
 * 3. 零 UI 依赖，纯数据和流程
 *
 * 变化（相对旧版）：提交/轮询/转存全部收敛到服务端编排层
 * （POST /api/generations、GET /api/generations/:id/status）；
 * 前端只负责参考图上传 OSS 与任务参数组装。importResultUrls 已退役。
 */
import { generationApi } from '@/services/generationApi'
import { ossApi } from '@/services/ossApi'

// ─── Types ───

export interface SubmitTaskParams {
  /** 逻辑模型 id（字段名暂保留，兼容现有调用方） */
  logicalModelId: number
  /** 最终发送给 API 的完整 prompt */
  prompt: string
  /** 用户输入的补充提示词（可为空） */
  userPrompt?: string
  /** 系统提示词（功能模式下有值） */
  systemPrompt?: string
  /** 宽高比，如 '3:4' */
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
  /** 生成数量，默认 1（服务端拆成多条任务） */
  n?: number
  /** 补充图片列表（带名称） */
  supplementaryImages?: { name: string; url: string }[]
  /** 结构化提示词字段快照（来自提示词工坊） */
  promptSegments?: Record<string, string>
  /** 负向规避词（自然语言追加） */
  negativePrompt?: string
  /** 所属套系（suite-gen 成套生图） */
  suiteId?: number
  /** 套系内点位序号 0-4 */
  pointIndex?: number
  clientBusinessId?: string
}

export interface SubmitTaskResult {
  /** 首条任务的业务任务号（gen-xxxxxxxx，下载命名/搜索用） */
  taskNo: string
  /** 首条任务的数据库记录 ID（轮询/行级恢复用） */
  dbTaskId: number
  /** n>1 时的全部任务 */
  tasks: Array<{ id: number; taskNo: string; status: string }>
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
  /** 兼容旧签名：转存已由服务端完成，忽略 */
  import?: boolean
}

export interface GenerateImageResult extends SubmitTaskResult {
  /** 轮询结果（仅当 poll=true 时有值） */
  pollResult?: PollTaskResult
  /** 结果图 OSS URL（仅当 poll=true 且完成后有值；转存由服务端完成） */
  resultUrls?: string[]
}

// ─── Helper Functions ───

/** 已存到本站存储的 URL（direct 模式 /api/files/ 本地地址，或 oss 模式 bucket 域名）直接透传，不重复上传 */
function isOwnStoredUrl(url: string, ossHost: string): boolean {
  if (url.startsWith('/api/files/')) return true
  return !!ossHost && url.includes(ossHost)
}

/**
 * 处理单个 URL：已存本站存储的直接加入，其余（data URL / 外部 http URL）下载后转存到本站存储
 */
async function processUrl(url: string, allImageUrls: string[], ossHost: string): Promise<void> {
  if (isOwnStoredUrl(url, ossHost)) {
    allImageUrls.push(url)
  } else if (url.startsWith('data:')) {
    // data URL（base64）→ 转 File 后上传到本站存储
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
      console.warn('[ImageGen] Failed to re-upload external URL, using original:', url, err)
      allImageUrls.push(url)
    }
  } else {
    allImageUrls.push(url)
  }
}

/**
 * 上传本地文件到本站存储（direct=后端落盘 / oss=浏览器直传 bucket）
 */
async function processFile(file: File, allImageUrls: string[]): Promise<void> {
  const uploaded = await ossApi.upload(file, 'inputs')
  allImageUrls.push(uploaded.publicUrl)
}

// ─── Step Functions ───

/**
 * 提交任务（上传参考图到 OSS → POST /api/generations，服务端编排完成
 * 校验/计价预扣/落库/派发）。同步/异步渠道对前端无差异。
 *
 * @param params 任务参数
 * @returns 任务号、数据库任务 ID 与输入图片 URL 列表
 */
export async function submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
  const {
    logicalModelId,
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
    suiteId,
    pointIndex,
    clientBusinessId,
  } = params

  if (!logicalModelId) {
    throw new Error('请先选择模型')
  }

  // ─── 验证：有图片但没有提示词 ───
  const hasImages = (refImages?.length ?? 0) > 0
  const hasSystemPrompt = !!(systemPrompt && systemPrompt.trim())
  const finalPrompt = prompt.trim()

  if (hasImages && !finalPrompt && !hasSystemPrompt) {
    throw new Error('请输入提示词，描述你想要生成的效果')
  }

  // ─── 上传参考图 ───
  const allImageUrls: string[] = []
  if (refImages && refImages.length > 0) {
    // 一次取存储模式（识别已存 URL 的透传依据），多张参考图共用
    const { ossHost } = await ossApi.getMode()
    for (const ref of refImages) {
      if (ref.url) {
        await processUrl(ref.url, allImageUrls, ossHost)
      } else if (ref.file) {
        await processFile(ref.file, allImageUrls)
      }
    }
  }

  // ─── 服务端编排提交（校验/计价/落库/派发）───
  const res = await generationApi.submit({
    logicalModelId: logicalModelId,
    prompt: finalPrompt,
    userPrompt,
    systemPrompt,
    aspectRatio: size,
    resolution,
    n,
    refImageUrls: allImageUrls,
    featureId,
    supplementaryImages,
    promptSegments,
    negativePrompt,
    suiteId,
    pointIndex,
    clientBusinessId,
  })
  const data = res.data.data
  const first = data.tasks[0]

  return {
    taskNo: first?.taskNo ?? '',
    dbTaskId: first?.id ?? 0,
    tasks: data.tasks,
    inputImageUrls: allImageUrls,
  }
}

/**
 * 阻塞式轮询任务状态（服务端单次查询 + 服务端转存）
 *
 * @param dbTaskId 数据库任务记录 ID
 * @param options 轮询配置
 * @returns 任务状态和结果
 */
export async function pollTask(
  dbTaskId: number,
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
      const res = await generationApi.getStatus(dbTaskId)
      const data = res.data.data

      const result: PollTaskResult = {
        status: (['queued', 'in_progress', 'completed', 'failed'].includes(data.status)
          ? data.status
          : 'in_progress') as PollTaskResult['status'],
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

// ─── High-Level Wrapper ───

/**
 * 统一图片生成函数（高层封装）
 *
 * 支持一键调用或分步控制：
 * - generateImage(params) — 只提交任务
 * - generateImage(params, { poll: true }) — 提交 + 阻塞轮询到终态
 *
 * 结果转存由服务端在轮询路径内完成（S5：转存失败保留原始 URL，
 * 任务详情提供「重新加载」入口，见 useTaskManager.retryImportTask）。
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

    result.pollResult = await pollTask(submitResult.dbTaskId, pollOptions)
    if (result.pollResult.status === 'completed') {
      result.resultUrls = result.pollResult.resultUrls
    }
  }

  return result
}

// ─── Legacy Exports (for backward compatibility) ───

// 保留旧的 GenerateImageParams 类型名（实际是 SubmitTaskParams）
export type GenerateImageParams = SubmitTaskParams
