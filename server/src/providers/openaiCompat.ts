import type {
  ProviderAdapter,
  ProviderRuntimeConfig,
  ChatRequest,
  ChatResult,
  ConnectionTestResult,
} from './types.js'
import { postJson, joinUrl, extractErrorMessage, ProviderCallError } from './http.js'

/**
 * 通用 OpenAI 兼容协议适配器（工厂）。
 *
 * 绝大多数服务商（火山引擎 / DeepSeek / Kimi / Qwen / ToAPIs 中转……）都提供
 * POST {base_url}/chat/completions + Bearer 认证的 OpenAI 风格接口，仅在路径、
 * 认证头、默认模型等细节上有差别 —— 通过 options 参数化后即可复用。
 *
 * 图片输入走 data URL 形式的 image_url（识图），无图片时 content 退化为纯字符串，
 * 兼容只认字符串 content 的旧实现。
 */

export interface OpenAiCompatOptions {
  code: string
  label: string
  description: string
  /** chat completions 路径，默认 /chat/completions */
  chatPath?: string
  /** 连接测试用的默认模型（服务商下无模型记录时的兜底） */
  defaultTestModel?: string
  /** 额外请求头（部分平台要求自定义头） */
  extraHeaders?: (ctx: ProviderRuntimeConfig) => Record<string, string>
}

/** 组装 OpenAI 风格的 messages.content：纯文本 → 字符串；带图 → 数组 */
function buildUserContent(req: ChatRequest): string | Array<Record<string, unknown>> {
  const images = req.images ?? []
  if (images.length === 0) {
    return req.messages.map((m) => m.content).join('\n')
  }
  // 有图片时：把全部消息文本拼进一条 user 消息（调试场景足够；适配器不承担多轮编排）
  const text = req.messages.map((m) => m.content).filter(Boolean).join('\n')
  const parts: Array<Record<string, unknown>> = []
  for (const img of images) {
    parts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })
  }
  if (text) parts.push({ type: 'text', text })
  return parts
}

export function createOpenAiCompatAdapter(options: OpenAiCompatOptions): ProviderAdapter {
  const chatPath = options.chatPath ?? '/chat/completions'

  async function request(req: ChatRequest, ctx: ProviderRuntimeConfig): Promise<ChatResult> {
    if (!ctx.apiKey) throw new ProviderCallError('未配置 API Key（请先在该服务商下设置主 Key）')
    const url = joinUrl(ctx.baseUrl, chatPath)
    const headers: Record<string, string> = {
      authorization: `Bearer ${ctx.apiKey}`,
      ...(options.extraHeaders?.(ctx) ?? {}),
    }

    const result = await postJson(url, headers, {
      model: req.model,
      messages: [{ role: 'user', content: buildUserContent(req) }],
      max_tokens: req.maxTokens ?? 2048,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    })

    if (result.status === 401 || result.status === 403) {
      throw new ProviderCallError(extractErrorMessage(result, 'API Key 无效或无权限'), result.status)
    }
    if (result.status !== 200) {
      throw new ProviderCallError(extractErrorMessage(result, '调用失败'), result.status)
    }

    const choice = result.json?.choices?.[0]?.message
    const text: string = typeof choice?.content === 'string' ? choice.content : ''
    if (!text) {
      throw new ProviderCallError('服务商返回了空回复（可能被内容安全策略拦截）', result.status, result.json)
    }
    const u = result.json?.usage
    return {
      text,
      reasoning: typeof choice?.reasoning_content === 'string' ? choice.reasoning_content : undefined,
      usage: u ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens } : undefined,
      raw: result.json,
    }
  }

  return {
    code: options.code,
    label: options.label,
    description: options.description,

    async chat(req, ctx) {
      return request(req, ctx)
    },

    async testConnection(ctx, testModel): Promise<ConnectionTestResult> {
      const model = testModel || options.defaultTestModel
      if (!model) {
        // 渠道下还没有任何模型：退化为 GET /v1/models 探测，至少验证连通性与 Key 有效性
        const started = Date.now()
        try {
          const res = await fetch(joinUrl(ctx.baseUrl, '/v1/models'), {
            headers: { Authorization: `Bearer ${ctx.apiKey}` },
            signal: AbortSignal.timeout(20_000),
          })
          if (res.ok) {
            return { ok: true, message: `Key 有效（/v1/models 探测，${Date.now() - started}ms）；该渠道尚未添加模型，请到「模型管理」添加后再测对话`, latencyMs: Date.now() - started }
          }
          return { ok: false, message: `Key 校验失败（HTTP ${res.status}），请检查 Key 是否有效` }
        } catch (err: any) {
          return { ok: false, message: err?.message || String(err) }
        }
      }
      const started = Date.now()
      try {
        await request({ model, messages: [{ role: 'user', content: 'ping' }], maxTokens: 8 }, ctx)
        return { ok: true, message: `连接成功（模型 ${model}，${Date.now() - started}ms）`, latencyMs: Date.now() - started }
      } catch (err: any) {
        return { ok: false, message: err?.message || String(err) }
      }
    },
  }
}

/** 通用 OpenAI 兼容适配器：协议无特殊之处的服务商直接选它，无需写代码 */
export const genericOpenAiAdapter = createOpenAiCompatAdapter({
  code: 'openai_compat',
  label: 'OpenAI 兼容',
  description: '通用 /chat/completions 协议 + Bearer 认证（DeepSeek / Kimi / Qwen / 各类中转等）',
})
