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
  /** 同一渠道配置可同时用于识图与生图时，标记本次调用职责 */
  providerTaskKind?: 'image' | 'chat'
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

// ── 生图适配器（ai-provider 重构新增）──

/** 生图请求（业务归一化参数，适配器负责转渠道格式） */
export interface ImageGenRequest {
  /** 渠道模型名（ai_models.model_id，发给上游的 model 字符串） */
  model: string
  /** 逻辑模型 code（toapis 适配器按它分支请求体格式） */
  logicalCode?: string
  prompt: string
  negativePrompt?: string
  aspectRatio: string      // '3:4'
  resolution: string       // '512' | '1K' | '2K' | '4K'
  n: number                // 恒为 1：n>1 由编排层拆成多条任务
  imageUrls: string[]      // 参考图 OSS URL
}

export interface GeneratedImage {
  url?: string
  base64?: string
  mimeType?: string
}

export interface ImageGenSubmitResult {
  mode: 'async' | 'sync'
  /** async：上游任务号 */
  providerTaskId?: string
  /** sync：直接带图 */
  images?: GeneratedImage[]
}

export interface ImageTaskStatus {
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  /** 上游 URL 过期时间（ToAPIs），转存调度参考 */
  expiresAt?: string
}

export interface ImageProviderAdapter extends ProviderAdapter {
  /** 生图提交；异步渠道返回任务号，同步渠道直接返回图片 */
  submitImageTask(req: ImageGenRequest, ctx: ProviderRuntimeConfig): Promise<ImageGenSubmitResult>
  /** 异步渠道轮询上游任务状态 */
  queryImageTask(providerTaskId: string, ctx: ProviderRuntimeConfig): Promise<ImageTaskStatus>
  /** 生图链路连通测试（与 chat 测试可能探测不同端点） */
  testImageConnection?(ctx: ProviderRuntimeConfig, testModel?: string): Promise<ConnectionTestResult>
  /** toapis = true，驱动「我的渠道」余额 UI（S3） */
  supportsBalance?: boolean
  queryBalance?(ctx: ProviderRuntimeConfig): Promise<{ balance: number; credits: number }>
}
