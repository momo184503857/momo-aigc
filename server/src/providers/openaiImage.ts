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
import { postJson, postForm, joinUrl, extractErrorMessage, ProviderCallError } from './http.js'
import { createOpenAiCompatAdapter } from './openaiCompat.js'
import { toPixelSize, clampPixelSize } from '../utils/imageSize.js'
import { resolveUpstreamInlineImages } from '../utils/upstreamImages.js'

/**
 * 通用 OpenAI 兼容生图适配器（同步）：POST {base}/v1/images/generations。
 *
 *  - 标准请求体 {model, prompt, n, size}；response_format 优先 url、失败回退 b64_json；
 *  - 参考图：走 /v1/images/edits 官方 multipart 文件上传（渠道支持才有意义，
 *    不支持的渠道在能力层配成"无参考图"）；multipart 被拒时回退 JSON image[] 等兼容格式；
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
    // 渠道硬限制（param_overrides.sizeClamp）在换算后等比钳制，如 relayrouter 单边≤3840 且总像素≤8294400
    const size = clampPixelSize(toPixelSize(req.aspectRatio, req.resolution), req.sizeClamp ?? {})
    const headers = { authorization: `Bearer ${ctx.apiKey}` }
    const baseBody = (): Record<string, unknown> => {
      const b: Record<string, unknown> = { model: req.model, prompt: req.prompt, n: 1, size, response_format: 'url' }
      if (req.negativePrompt) b.negative_prompt = req.negativePrompt
      return b
    }

    // 参考图统一拉成内联 bytes（本地读盘 / 远程 OSS 服务端拉回，单图 ≤10MB）：
    // edits 走官方 multipart 文件上传——RelayRouter 等中转的 edits 端点只认 multipart
    // （JSON image[] URL 数组会被网关以 failed to parse multipart form 拒绝，2026-09-02 生产实测）
    const refImages = await resolveUpstreamInlineImages(req.imageUrls)

    let result
    if (refImages.length === 0) {
      // 文生图：POST /v1/images/generations（JSON）；response_format=url 不被支持时回退 b64_json
      let body = baseBody()
      result = await postJson(joinUrl(ctx.baseUrl, '/v1/images/generations'), headers, body, 600_000)
      if (result.status === 400 || result.status === 422) {
        body = { ...body, response_format: 'b64_json' }
        result = await postJson(joinUrl(ctx.baseUrl, '/v1/images/generations'), headers, body, 600_000)
      }
    } else {
      // 图生图：POST /v1/images/edits，官方 multipart 优先；400/422 依序回退
      // JSON image[]（data URL）→ images[].image_url（new-api 私有格式）→ 最后 b64_json 重试
      const form = new FormData()
      for (const [k, v] of Object.entries(baseBody())) form.append(k, String(v))
      refImages.forEach((img, i) => {
        const ext = img.mimeType === 'image/jpeg' ? 'jpg' : img.mimeType.split('/')[1] || 'png'
        form.append('image', new Blob([Buffer.from(img.base64, 'base64')], { type: img.mimeType }), `reference-${i + 1}.${ext}`)
      })
      result = await postForm(joinUrl(ctx.baseUrl, '/v1/images/edits'), headers, form, 600_000)

      const callJson = (b: Record<string, unknown>) => postJson(joinUrl(ctx.baseUrl, '/v1/images/edits'), headers, b, 600_000)
      let currentBody: Record<string, unknown> | null = null
      if (result.status === 400 || result.status === 422) {
        const dataUrls = refImages.map((img) => `data:${img.mimeType};base64,${img.base64}`)
        currentBody = { ...baseBody(), image: dataUrls }
        result = await callJson(currentBody)
        if ((result.status === 400 || result.status === 422) && /image_url/i.test(extractErrorMessage(result, ''))) {
          currentBody = { ...currentBody, image: undefined, images: dataUrls.map((u) => ({ image_url: u })) }
          result = await callJson(currentBody)
        }
      }
      if ((result.status === 400 || result.status === 422) && currentBody) {
        result = await callJson({ ...currentBody, response_format: 'b64_json' })
      }
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
