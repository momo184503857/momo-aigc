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
import { toPixelSize } from '../utils/imageSize.js'
import { resolveUpstreamImageUrls } from '../utils/upstreamImages.js'

/**
 * 火山引擎 Ark 生图适配器（同步，豆包 Seedream 系列）。
 *
 * POST {base}/api/v3/images/generations（或 /v3，按 base_url 拼接）：
 *  - Ark 生图格式 {model, prompt, size, image?: string[]}，Bearer 认证；
 *  - 同步返回 data[].url 列表。
 */

const ARK_IMAGE_PATHS = ['/api/v3/images/generations', '/v3/images/generations']

const chatAdapter = createOpenAiCompatAdapter({
  code: 'volcengine_image',
  label: '火山引擎生图',
  description: '内部复用：volcengine_image 渠道的文字调用',
  chatPath: '/chat/completions',
})

export const volcengineImageAdapter: ImageProviderAdapter = {
  code: 'volcengine_image',
  label: '火山引擎生图（Seedream·同步）',
  description: '火山方舟 Ark /api/v3/images/generations（豆包 Seedream；提交后直接返回图片）',

  async chat(req: ChatRequest, ctx: ProviderRuntimeConfig): Promise<ChatResult> {
    return chatAdapter.chat(req, ctx)
  },

  async testConnection(ctx, testModel): Promise<ConnectionTestResult> {
    const started = Date.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20_000)
      let lastStatus = 0
      try {
        for (const p of ARK_IMAGE_PATHS) {
          const res = await fetch(joinUrl(ctx.baseUrl, p), {
            method: 'HEAD',
            headers: { Authorization: `Bearer ${ctx.apiKey}` },
            signal: controller.signal,
          }).catch(() => null)
          if (res && res.status !== 404) {
            return { ok: res.status < 500, message: `连接探测 HTTP ${res.status}（${Date.now() - started}ms）`, latencyMs: Date.now() - started }
          }
          if (res) lastStatus = res.status
        }
      } finally {
        clearTimeout(timer)
      }
      return { ok: false, message: `连接失败（HTTP ${lastStatus}），请检查 Base URL 与 Key` }
    } catch (err: any) {
      return { ok: false, message: err?.message || String(err) }
    }
  },

  async testImageConnection(ctx, testModel): Promise<ConnectionTestResult> {
    return this.testConnection(ctx, testModel)
  },

  async submitImageTask(req: ImageGenRequest, ctx: ProviderRuntimeConfig): Promise<ImageGenSubmitResult> {
    if (!ctx.apiKey) throw new ProviderCallError('未配置 API Key（请先在该渠道下设置主 Key）')
    const size = toPixelSize(req.aspectRatio, req.resolution)
    // 直接传模式：本地参考图转 base64 data URL（Ark image 数组官方支持）
    const imageUrls = await resolveUpstreamImageUrls('volcengine_image', req.imageUrls, { baseUrl: ctx.baseUrl, apiKey: ctx.apiKey })
    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      size,
      response_format: 'url',
    }
    if (imageUrls.length > 0) body.image = imageUrls

    let lastError: ProviderCallError | null = null
    for (const path of ARK_IMAGE_PATHS) {
      const result = await postJson(joinUrl(ctx.baseUrl, path), {
        authorization: `Bearer ${ctx.apiKey}`,
      }, body, 600_000)
      if (result.status === 404) {
        lastError = new ProviderCallError(extractErrorMessage(result, '生图端点不存在'), 404, result.json)
        continue
      }
      if (result.status !== 200) {
        throw new ProviderCallError(extractErrorMessage(result, '生图请求失败'), result.status, result.json)
      }
      const items: any[] = result.json?.data ?? []
      const images = items
        .map((it) => (typeof it.url === 'string' && it.url ? { url: it.url } : typeof it.b64_json === 'string' ? { base64: it.b64_json, mimeType: 'image/png' } : null))
        .filter(Boolean) as { url?: string; base64?: string }[]
      if (images.length === 0) {
        throw new ProviderCallError('上游未返回任何图片', result.status, result.json)
      }
      return { mode: 'sync', images }
    }
    throw lastError ?? new ProviderCallError('生图请求失败')
  },

  async queryImageTask(_providerTaskId: string, _ctx: ProviderRuntimeConfig): Promise<ImageTaskStatus> {
    return { status: 'failed', progress: 0, resultUrls: [], errorMessage: '同步渠道不支持任务轮询' }
  },
}
