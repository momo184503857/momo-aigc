/**
 * AI 服务商适配器统一抽象。
 *
 * 每个服务商一个独立适配器模块（见 providers/ 目录），实现本文件的 ProviderAdapter
 * 接口并注册到 registry（providers/index.ts）。业务层（路由/服务）只面向接口编程，
 * 不关心各服务商的协议差异 —— 新增服务商时：
 *   1. 协议兼容 OpenAI → 直接用 openai_compat 适配器，零代码；
 *   2. 协议有差异 → 新建 volcengine.ts 这样的独立文件实现接口，注册即可。
 */

/** 运行时配置：DB 行 + 解密后的 API Key（主 Key） */
export interface ProviderRuntimeConfig {
  providerId: number
  code: string
  name: string
  baseUrl: string
  apiKey: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 图片输入（识图）。mimeType 如 image/png、image/jpeg */
export interface ChatImage {
  mimeType: string
  base64: string
}

export interface ChatRequest {
  /** 调用服务商 API 时使用的模型名（ai_models.model_id） */
  model: string
  messages: ChatMessage[]
  images?: ChatImage[]
  maxTokens?: number
  temperature?: number
}

export interface ChatUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface ChatResult {
  /** 最终回答文本 */
  text: string
  /** 推理型模型的思维链（如有），仅调试展示用 */
  reasoning?: string
  usage?: ChatUsage
  /** 服务商原始响应（调试展示用） */
  raw: unknown
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export interface ProviderAdapter {
  /** 适配器标识（api_providers.adapter 列存这个值） */
  readonly code: string
  readonly label: string
  readonly description: string
  /** 对话/识图调用 */
  chat(req: ChatRequest, ctx: ProviderRuntimeConfig): Promise<ChatResult>
  /** 连接测试（用最小请求探测连通性与 Key 有效性） */
  testConnection(ctx: ProviderRuntimeConfig, testModel?: string): Promise<ConnectionTestResult>
}
