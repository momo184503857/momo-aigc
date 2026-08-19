import type {
  ImageProviderAdapter,
  ImageGenRequest,
  ImageGenSubmitResult,
  ImageTaskStatus,
  ChatRequest,
  ChatResult,
  ConnectionTestResult,
  ProviderRuntimeConfig,
} from './types.js'
import { postJson, joinUrl, extractErrorMessage, ProviderCallError } from './http.js'
import { createOpenAiCompatAdapter } from './openaiCompat.js'

/**
 * ToAPIs 生图适配器（异步任务式）。
 *
 * 迁移自 utils/toapis.ts + 前端 buildGptImage2Request/buildGeminiRequest：
 *  - 提交 POST {base}/v1/images/generations → 返回任务号（异步）；
 *  - 轮询 GET  {base}/v1/images/generations/:id → status/progress/resultUrls；
 *  - 请求体按逻辑模型分支：gpt-image-2 用顶层 resolution + reference_images，
 *    gemini 系用 metadata.resolution + image_urls（现状格式，原样保留）；
 *  - 余额查询沿用 /v1/balance（supportsBalance=true，驱动「我的渠道」余额 UI）；
 *  - 文字调用（chat）与 OpenAI 兼容协议同构，复用 openaiCompat 工厂（/v1/chat/completions）。
 */

async function getJson(url: string, apiKey: string, timeoutMs = 120_000): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal })
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON 响应 */ }
    if (!res.ok) {
      const msg = json?.message || json?.error?.message || `请求失败（HTTP ${res.status}）${text ? '：' + text.slice(0, 200) : ''}`
      throw new ProviderCallError(msg, res.status, json)
    }
    return json
  } finally {
    clearTimeout(timer)
  }
}

function buildCreateBody(req: ImageGenRequest): Record<string, unknown> {
  if (req.logicalCode === 'gpt-image-2') {
    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      n: 1,
      size: req.aspectRatio,
      resolution: req.resolution,
      response_format: 'url',
    }
    if (req.imageUrls.length > 0) body.reference_images = req.imageUrls
    return body
  }
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    n: 1,
    size: req.aspectRatio,
    metadata: { resolution: req.resolution },
  }
  if (req.imageUrls.length > 0) body.image_urls = req.imageUrls
  return body
}

const chatAdapter = createOpenAiCompatAdapter({
  code: 'toapis',
  label: 'ToAPIs',
  description: '内部复用：toapis 渠道的文字调用（/v1/chat/completions）',
  chatPath: '/v1/chat/completions',
  defaultTestModel: 'gpt-5.5',
})

export const toapisImageAdapter: ImageProviderAdapter = {
  code: 'toapis',
  label: 'ToAPIs（异步任务）',
  description: 'ToAPIs 中转（生图为异步任务式：提交→轮询；支持余额查询；文字走 /v1/chat/completions）',

  async chat(req: ChatRequest, ctx: ProviderRuntimeConfig): Promise<ChatResult> {
    return chatAdapter.chat(req, ctx)
  },

  async testConnection(ctx, testModel): Promise<ConnectionTestResult> {
    const started = Date.now()
    try {
      await getJson(joinUrl(ctx.baseUrl, '/v1/models'), ctx.apiKey, 20_000)
      return { ok: true, message: `连接成功（${Date.now() - started}ms）`, latencyMs: Date.now() - started }
    } catch (err: any) {
      return { ok: false, message: err?.message || String(err) }
    }
  },

  async testImageConnection(ctx, _testModel): Promise<ConnectionTestResult> {
    return this.testConnection(ctx, _testModel)
  },

  async submitImageTask(req: ImageGenRequest, ctx: ProviderRuntimeConfig): Promise<ImageGenSubmitResult> {
    if (!ctx.apiKey) throw new ProviderCallError('未配置 API Key（请先在该渠道下设置主 Key）')
    const result = await postJson(
      joinUrl(ctx.baseUrl, '/v1/images/generations'),
      { authorization: `Bearer ${ctx.apiKey}` },
      buildCreateBody(req),
      120_000,
    )
    if (result.status !== 200) {
      throw new ProviderCallError(extractErrorMessage(result, '创建生图任务失败'), result.status, result.json)
    }
    const id = result.json?.id
    if (!id) throw new ProviderCallError('上游未返回任务 ID', result.status, result.json)
    return { mode: 'async', providerTaskId: String(id) }
  },

  async queryImageTask(providerTaskId: string, ctx: ProviderRuntimeConfig): Promise<ImageTaskStatus> {
    if (!ctx.apiKey) throw new ProviderCallError('未配置 API Key')
    const data = await getJson(joinUrl(ctx.baseUrl, `/v1/images/generations/${encodeURIComponent(providerTaskId)}`), ctx.apiKey)
    return {
      status: data.status,
      progress: data.progress ?? 0,
      resultUrls: (data.result?.data || []).map((img: { url: string }) => img.url),
      expiresAt: data.expires_at,
      errorMessage: data.error?.message,
      errorCode: data.error?.code,
    }
  },

  supportsBalance: true,

  async queryBalance(ctx: ProviderRuntimeConfig): Promise<{ balance: number; credits: number }> {
    if (!ctx.apiKey) throw new ProviderCallError('未配置 API Key')
    const data = await getJson(joinUrl(ctx.baseUrl, '/v1/balance'), ctx.apiKey, 20_000)
    if (data.success === false) throw new ProviderCallError(data.message || '余额查询失败')
    return { balance: data.remain_balance ?? 0, credits: data.remain_credits ?? 0 }
  },
}
