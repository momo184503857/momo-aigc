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
 * 通用 OpenAI 兼容生图适配器（同步）：POST {base}/v1/images/generations。
 *
 *  - 标准请求体 {model, prompt, n, size}；response_format 优先 url、失败回退 b64_json；
 *  - 参考图：透传 image[] / image_url 字段（渠道支持才有意义，不支持的渠道在能力层配成"无参考图"）；
 *  - 结果 url / base64 均归一为 GeneratedImage。
 */

const chatAdapter = createOpenAiCompatAdapter({
  code: 'openai_image',
  label: 'OpenAI 兼容生图',
  description: '内部复用：openai_image 渠道的文字调用',
  chatPath: '/v1/chat/completions',
})

export const openaiImageAdapter: ImageProviderAdapter = {
  code: 'openai_image',
  label: 'OpenAI 兼容生图（同步）',
  description:
    'OpenAI 兼容生图（同步返回图片；带参考图自动走 /v1/images/edits 图生图）',

  async chat(req: ChatRequest, ctx: ProviderRuntimeConfig): Promise<ChatResult> {
    return chatAdapter.chat(req, ctx)
  },

  async testConnection(ctx, testModel): Promise<ConnectionTestResult> {
    // 生图渠道优先探测生图端点（GET /v1/models 是最轻的连通性探测）
    const started = Date.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20_000)
      let ok = false
      let status = 0
      try {
        const res = await fetch(joinUrl(ctx.baseUrl, '/v1/models'), {
          headers: { Authorization: `Bearer ${ctx.apiKey}` },
          signal: controller.signal,
        })
        status = res.status
        ok = res.ok
      } finally {
        clearTimeout(timer)
      }
      if (ok) return { ok: true, message: `连接成功（${Date.now() - started}ms）`, latencyMs: Date.now() - started }
      if (status === 404) {
        // 部分中转不提供 /v1/models，退回 chat 探测
        return chatAdapter.testConnection(ctx, testModel)
      }
      return { ok: false, message: `连接失败（HTTP ${status}），请检查 Base URL 与 Key` }
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
    // 直接传模式：本地参考图转 base64 data URL（上游可直读，无需公网地址）
    const imageUrls = await resolveUpstreamImageUrls('openai_image', req.imageUrls, { baseUrl: ctx.baseUrl, apiKey: ctx.apiKey })
    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      n: 1,
      size,
      response_format: 'url',
    }
    if (req.negativePrompt) body.negative_prompt = req.negativePrompt
    // 参考图走图生图端点（OpenAI 语义：generations=文生图，edits=图生图），
    // image 字段以 URL/data-URL 数组透传，由上游自行下载或解码
    if (imageUrls.length > 0) {
      body.image = imageUrls
    }
    const path = imageUrls.length > 0 ? '/v1/images/edits' : '/v1/images/generations'

    let result = await postJson(joinUrl(ctx.baseUrl, path), {
      authorization: `Bearer ${ctx.apiKey}`,
    }, body, 300_000)

    if (result.status === 400 || result.status === 422) {
      // response_format=url 不被支持时回退 b64_json 重试一次
      const retryBody = { ...body, response_format: 'b64_json' }
      result = await postJson(joinUrl(ctx.baseUrl, path), {
        authorization: `Bearer ${ctx.apiKey}`,
      }, retryBody, 300_000)
    }

    if (result.status !== 200) {
      throw new ProviderCallError(extractErrorMessage(result, '生图请求失败'), result.status, result.json)
    }
    const items: any[] = result.json?.data ?? []
    if (!Array.isArray(items) || items.length === 0) {
      throw new ProviderCallError('上游未返回任何图片', result.status, result.json)
    }
    const images = items.map((it) => {
      if (typeof it.url === 'string' && it.url) return { url: it.url }
      if (typeof it.b64_json === 'string' && it.b64_json) {
        return { base64: it.b64_json, mimeType: 'image/png' }
      }
      return {}
    }).filter((it) => it.url || it.base64)
    if (images.length === 0) {
      throw new ProviderCallError('上游返回的图片既无 url 也无 b64_json', result.status, result.json)
    }
    return { mode: 'sync', images }
  },

  async queryImageTask(_providerTaskId: string, _ctx: ProviderRuntimeConfig): Promise<ImageTaskStatus> {
    // 同步渠道无任务号可查
    return { status: 'failed', progress: 0, resultUrls: [], errorMessage: '同步渠道不支持任务轮询' }
  },
}
