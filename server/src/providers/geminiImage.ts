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
import { resolveUpstreamInlineImages } from '../utils/upstreamImages.js'

/**
 * Gemini 原生生图适配器（同步，Gemini 3 系列 / Nano Banana）。
 *
 * POST {base}/v1beta/models/{model}:generateContent（x-goog-api-key 鉴权）：
 *  - contents[].parts：参考图 inlineData{mimeType, data(base64)} + 文字指令（无独立 edits
 *    端点，图生图与文生图同走 generateContent 多模态输入）；
 *  - generationConfig.imageConfig{aspectRatio, imageSize} 控制比例与分辨率档位（1K/2K/4K）；
 *  - 同步返回 candidates[].content.parts[].inlineData（base64 图片）。
 * 注意部分中转的 OpenAI 兼容层会丢弃 imageConfig（实测 relayrouter chat 端点恒出 2K），
 * Gemini 全档能力只有原生协议可用——这正是本适配器存在的理由。
 */

const chatAdapter = createOpenAiCompatAdapter({
  code: 'gemini_image',
  label: 'Gemini 原生生图',
  description: '内部复用：gemini_image 渠道的文字调用',
  chatPath: '/v1/chat/completions',
})

/** 项目分辨率档位 → Gemini imageSize 合法值（Gemini 无 512 档，防御性升到 1K） */
function toImageSize(resolution: string): string {
  return resolution === '1K' || resolution === '2K' || resolution === '4K' ? resolution : '1K'
}

export const geminiImageAdapter: ImageProviderAdapter = {
  code: 'gemini_image',
  label: 'Gemini 原生生图（同步）',
  description: 'POST /v1beta/models/{model}:generateContent（Gemini 3 系列；参考图 inlineData 内联，同步返回）',

  async chat(req: ChatRequest, ctx: ProviderRuntimeConfig): Promise<ChatResult> {
    return chatAdapter.chat(req, ctx)
  },

  async testConnection(ctx, testModel): Promise<ConnectionTestResult> {
    const started = Date.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20_000)
      let status = 0
      try {
        const res = await fetch(joinUrl(ctx.baseUrl, '/v1beta/models'), {
          headers: { 'x-goog-api-key': ctx.apiKey },
          signal: controller.signal,
        })
        status = res.status
      } finally {
        clearTimeout(timer)
      }
      if (status >= 200 && status < 300) {
        return { ok: true, message: `连接成功（${Date.now() - started}ms）`, latencyMs: Date.now() - started }
      }
      if (status === 404) {
        // 部分中转只实现了 generateContent 未实现模型列表，退回 chat 端点探测
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
    // Gemini 只收内联 bytes：本地文件与远程 URL 都在服务端转 base64（原始 URL 仅存 DB）
    const refs = await resolveUpstreamInlineImages(req.imageUrls)
    const parts: Array<Record<string, unknown>> = refs.map((r) => ({
      inlineData: { mimeType: r.mimeType, data: r.base64 },
    }))
    parts.push({ text: req.prompt })
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { imageConfig: { aspectRatio: req.aspectRatio, imageSize: toImageSize(req.resolution) } },
    }
    const url = joinUrl(ctx.baseUrl, `/v1beta/models/${encodeURIComponent(req.model)}:generateContent`)
    const result = await postJson(url, { 'x-goog-api-key': ctx.apiKey }, body, 600_000)
    if (result.status !== 200) {
      throw new ProviderCallError(extractErrorMessage(result, '生图请求失败'), result.status, result.json)
    }
    const candidate = result.json?.candidates?.[0]
    const rawParts: any[] = candidate?.content?.parts ?? []
    const images = rawParts
      .map((p) => {
        const inline = p?.inlineData ?? p?.inline_data
        if (inline && typeof inline.data === 'string' && inline.data) {
          const mimeType = typeof inline.mimeType === 'string' && inline.mimeType ? inline.mimeType : 'image/png'
          return { base64: inline.data, mimeType }
        }
        return null
      })
      .filter(Boolean) as { base64: string; mimeType?: string }[]
    if (images.length === 0) {
      const block = result.json?.promptFeedback?.blockReason
      const text = rawParts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim()
      let reason: string
      if (block) reason = `内容被安全策略拦截（${block}）`
      else if (candidate?.finishReason && candidate.finishReason !== 'STOP') reason = `finishReason=${candidate.finishReason}`
      else if (text) reason = `上游仅返回文字：${text.slice(0, 200)}`
      else reason = '上游未返回任何图片'
      throw new ProviderCallError(`生图失败：${reason}`, result.status, result.json)
    }
    return { mode: 'sync', images }
  },

  async queryImageTask(_providerTaskId: string, _ctx: ProviderRuntimeConfig): Promise<ImageTaskStatus> {
    return { status: 'failed', progress: 0, resultUrls: [], errorMessage: '同步渠道不支持任务轮询' }
  },
}
