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
import { resolveUpstreamImageUrls } from '../utils/upstreamImages.js'

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

/**
 * ToAPIs 备用入口（同源后端的不同线路，任务号/托管图通用）。
 * 主入口取渠道 base_url（DB 配置），网络层失败时按序切换下一个；
 * 跨境链路抖动时 undici 内置 10s 连接超时先于业务超时触发（fetch failed），换线路通常即可恢复。
 */
const TOAPIS_FALLBACK_BASES = ['https://toapis.cn', 'https://toapis.com']

function candidateBases(primary: string | undefined): string[] {
  const list = [primary, ...TOAPIS_FALLBACK_BASES]
    .filter((b): b is string => !!b && /^https?:\/\//i.test(b))
    .map((b) => b.replace(/\/+$/, ''))
  return [...new Set(list)]
}

/** 网络层失败（连接未建立即断，请求未送达上游）→ 可安全换入口重试；总超时 abort 说明请求可能已发出，不重试 */
function isNetworkFailure(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: { code?: string } } | undefined
  if (!e) return false
  if (e.name === 'AbortError' || /aborted/i.test(String(e.message))) return false
  const code = e.cause?.code ?? ''
  const NET_CODES = ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED', 'EPROTO']
  return (err instanceof TypeError && /fetch failed/i.test(e.message ?? '')) || NET_CODES.includes(code)
}

/** 依次尝试各入口，网络层失败换下一个；全部失败时抛出包含各入口与末次错误码的错误（业务错误原样抛出，走 Key 轮换） */
async function withBaseFailover<T>(primaryBase: string | undefined, fn: (base: string) => Promise<T>): Promise<T> {
  const bases = candidateBases(primaryBase)
  let lastErr: unknown
  for (const base of bases) {
    try {
      return await fn(base)
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      lastErr = err
    }
  }
  const e = lastErr as { cause?: { code?: string }; message?: string } | undefined
  const detail = e?.cause?.code || e?.message || '网络错误'
  throw new ProviderCallError(`ToAPIs 全部入口均无法连接（${bases.join(' → ')}）：${detail}（请求未送达上游，请稍后重试）`)
}

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
      const base = await withBaseFailover(ctx.baseUrl, async (b) => {
        await getJson(joinUrl(b, '/v1/models'), ctx.apiKey, 20_000)
        return b
      })
      return { ok: true, message: `连接成功（入口 ${base}，${Date.now() - started}ms）`, latencyMs: Date.now() - started }
    } catch (err: any) {
      return { ok: false, message: err?.message || String(err) }
    }
  },

  async testImageConnection(ctx, _testModel): Promise<ConnectionTestResult> {
    return this.testConnection(ctx, _testModel)
  },

  async submitImageTask(req: ImageGenRequest, ctx: ProviderRuntimeConfig): Promise<ImageGenSubmitResult> {
    if (!ctx.apiKey) throw new ProviderCallError('未配置 API Key（请先在该渠道下设置主 Key）')
    return withBaseFailover(ctx.baseUrl, async (base) => {
      // 直接传模式：本地参考图先经 /v1/uploads/images 换渠道托管 URL（消耗 Key，参与轮换）。
      // 换入口重试时重新上传（各入口托管图通用，仅多一次上传开销）
      const imageUrls = await resolveUpstreamImageUrls('toapis', req.imageUrls, { baseUrl: base, apiKey: ctx.apiKey })
      const result = await postJson(
        joinUrl(base, '/v1/images/generations'),
        { authorization: `Bearer ${ctx.apiKey}` },
        buildCreateBody({ ...req, imageUrls }),
        120_000,
      )
      if (result.status !== 200) {
        throw new ProviderCallError(extractErrorMessage(result, '创建生图任务失败'), result.status, result.json)
      }
      const id = result.json?.id
      if (!id) throw new ProviderCallError('上游未返回任务 ID', result.status, result.json)
      return { mode: 'async', providerTaskId: String(id) }
    })
  },

  async queryImageTask(providerTaskId: string, ctx: ProviderRuntimeConfig): Promise<ImageTaskStatus> {
    if (!ctx.apiKey) throw new ProviderCallError('未配置 API Key')
    const data = await withBaseFailover(ctx.baseUrl, (base) =>
      getJson(joinUrl(base, `/v1/images/generations/${encodeURIComponent(providerTaskId)}`), ctx.apiKey),
    )
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
    const data = await withBaseFailover(ctx.baseUrl, (base) =>
      getJson(joinUrl(base, '/v1/balance'), ctx.apiKey, 20_000),
    )
    if (data.success === false) throw new ProviderCallError(data.message || '余额查询失败')
    return { balance: data.remain_balance ?? 0, credits: data.remain_credits ?? 0 }
  },
}
