import http from './http'

/**
 * 管理后台「配置」页 API：AI 服务商 / 模型 / Key 管理。
 * 对应后端 server/src/routes/admin/aiConfig.ts。
 */

export interface AdapterInfo {
  code: string
  label: string
  description: string
  imageCapable?: boolean
  supportsBalance?: boolean
}

/** 逻辑模型（标准模型抽象：能力定义，所有关联渠道模型共享） */
export interface LogicalModelRow {
  id: number
  code: string
  name: string
  kind: 'image' | 'text'
  defaultParams: {
    resolutions?: string[]
    aspectRatiosByResolution?: Record<string, string[]>
    aspectRatios?: string[]
    maxReferenceImages?: number
    maxPromptChars?: number
  }
  status: 'active' | 'disabled'
  remark: string
  modelCount: number
  createdAt: string
  updatedAt: string
}

/** 渠道 Key（Key 池：正整数优先级小者优先；状态含服务端标记的耗尽） */
export interface ProviderKeyRow {
  id: number
  provider_id: number
  name: string
  /** 完整 Key 明文（明文存储，可复制展示）；历史密文解密失败时为 null */
  key: string | null
  key_hint: string
  priority: number
  status: 'active' | 'disabled' | 'exhausted'
  /** 耗尽时间（仅 exhausted 态非空；服务端欠费切换写入） */
  exhausted_at: string | null
  last_checked_at: string | null
  last_check_ok: boolean | null
  created_at: string
}

export interface ModelRow {
  id: number
  provider_id: number
  model_id: string
  display_name: string
  supports_vision: boolean
  supports_image_gen: boolean
  supports_chat?: boolean
  logical_model_id?: number | null
  logical_code?: string | null
  logical_name?: string | null
  param_overrides?: Record<string, unknown> | null
  pricing?: Record<string, number> | null
  remark: string
  status: 'active' | 'disabled'
  created_at: string
  updated_at: string
}

export interface ProviderRow {
  id: number
  code: string
  name: string
  /** 用户可见渠道名（对用户隐藏真实渠道商；NULL = 直接显示 name） */
  display_name: string | null
  base_url: string
  adapter: string
  adapter_label: string
  remark: string
  status: 'active' | 'disabled'
  /** 首个可用 Key 的脱敏 hint（无可用 Key 时为空） */
  first_key_hint: string
  /** 是否存在可用 Key（全部停用/耗尽时 false，渠道实际不可用） */
  has_active_key: boolean
  keys: ProviderKeyRow[]
  models: ModelRow[]
  created_at: string
  updated_at: string
}

export interface ProviderPayload {
  name: string
  /** 机器唯一标识；选填，留空由后端自动生成（provider / provider-2 / ...） */
  code?: string
  /** 用户可见渠道名；置空回退显示 name */
  display_name?: string
  base_url: string
  adapter: string
  remark?: string
}

export interface ModelPayload {
  provider_id: number
  model_id: string
  display_name?: string
  supports_vision: boolean
  supports_image_gen: boolean
  supports_chat?: boolean
  logical_model_id?: number | null
  param_overrides?: Record<string, unknown> | null
  pricing?: Record<string, number> | null
  remark?: string
  status?: 'active' | 'disabled'
}

export interface KeyPayload {
  provider_id: number
  name: string
  key: string
  /** 优先级（≥1 整数，小者优先）；缺省 = 该渠道现有最大 + 1 */
  priority?: number
}

export interface TestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export interface ChatDebugResult {
  text: string
  reasoning: string | null
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null
  latencyMs: number
}

/** 默认识图模型配置（成套生图 AI 识别共用出口） */
export interface DefaultVisionSetting {
  providerId: number
  modelId: string
}

/** 存储配置：direct=直接传（图片存本机磁盘、参考图直传渠道，默认）/ oss=阿里云 OSS */
export interface StorageConfig {
  mode: 'direct' | 'oss'
  oss: {
    endpoint: string
    bucket: string
    accessKeyId: string
    accessKeySecret: string
    resultImportWorkerUrl: string
  }
}

export const aiConfigApi = {
  listAdapters: () => http.get<{ data: AdapterInfo[] }>('/admin/ai-config/adapters'),
  listProviders: () => http.get<{ data: ProviderRow[] }>('/admin/ai-config/providers'),
  createProvider: (payload: ProviderPayload) => http.post<{ data: ProviderRow }>('/admin/ai-config/providers', payload),
  updateProvider: (id: number, payload: Partial<ProviderPayload> & { status?: string }) =>
    http.patch<{ data: ProviderRow }>(`/admin/ai-config/providers/${id}`, payload),
  deleteProvider: (id: number) => http.delete(`/admin/ai-config/providers/${id}`),
  testProvider: (id: number) => http.post<{ data: TestResult }>(`/admin/ai-config/providers/${id}/test`, {}),

  createModel: (payload: ModelPayload) => http.post<{ data: ModelRow }>('/admin/ai-config/models', payload),
  updateModel: (id: number, payload: Partial<ModelPayload>) => http.patch<{ data: ModelRow }>(`/admin/ai-config/models/${id}`, payload),
  deleteModel: (id: number) => http.delete(`/admin/ai-config/models/${id}`),

  createKey: (payload: KeyPayload) => http.post<{ data: ProviderKeyRow }>('/admin/ai-config/keys', payload),
  updateKey: (id: number, payload: { name?: string; key?: string; priority?: number; status?: string }) =>
    http.patch<{ data: ProviderKeyRow }>(`/admin/ai-config/keys/${id}`, payload),
  deleteKey: (id: number) => http.delete(`/admin/ai-config/keys/${id}`),
  testKey: (id: number) => http.post<{ data: TestResult }>(`/admin/ai-config/keys/${id}/test`, {}),

  /** 调试调用（识图/对话），走「第一个可用 Key + 适配器」完整链路 */
  chat: (payload: { provider_id: number; model: string; prompt: string; image?: { mimeType: string; base64: string } }) =>
    http.post<{ data: ChatDebugResult }>('/admin/ai-config/chat', payload, { timeout: 120_000 }),

  /** 默认识图模型：业务侧（成套生图 AI 识别）共用的识图出口 */
  getDefaultVisionModel: () => http.get<{ data: DefaultVisionSetting | null }>('/admin/ai-config/default-vision-model'),
  setDefaultVisionModel: (payload: { provider_id: number; model_id: string } | null) =>
    http.put<{ data: DefaultVisionSetting | null }>('/admin/ai-config/default-vision-model', payload ?? {}),

  /** 逻辑模型管理（FR2） */
  listLogicalModels: () => http.get<{ data: LogicalModelRow[] }>('/admin/ai-config/logical-models'),
  updateLogicalModel: (id: number, payload: { name: string }) => http.patch<{ data: LogicalModelRow }>(`/admin/ai-config/logical-models/${id}`, payload),

  /** 存储配置（直接传 / 阿里云 OSS，含 OSS 密钥——存 DB 不入 git） */
  getStorageConfig: () => http.get<{ data: StorageConfig }>('/admin/ai-config/storage'),
  saveStorageConfig: (payload: { mode: 'direct' | 'oss'; oss?: Partial<StorageConfig['oss']> }) =>
    http.put<{ data: StorageConfig }>('/admin/ai-config/storage', payload),
  testStorageConfig: (oss?: Partial<StorageConfig['oss']>) =>
    http.post<{ data: TestResult }>('/admin/ai-config/storage/test', { oss: oss ?? {} }, { timeout: 60_000 }),
}
