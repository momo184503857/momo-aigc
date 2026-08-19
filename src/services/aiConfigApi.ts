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

/** 用户自建渠道（只读视图，S1） */
export interface UserProviderRow {
  id: number
  code: string
  name: string
  base_url: string
  adapter: string
  status: string
  owner_user_id: number
  owner_username: string | null
  owner_nickname: string | null
  model_count: number
  key_hint: string
  created_at: string
}

export interface ProviderKeyRow {
  id: number
  provider_id: number
  name: string
  /** 完整 Key 明文（平台渠道明文存储，可复制展示）；历史密文解密失败时为 null */
  key: string | null
  key_hint: string
  is_primary: boolean
  status: 'active' | 'disabled'
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
  base_url: string
  adapter: string
  adapter_label: string
  remark: string
  status: 'active' | 'disabled'
  primary_key_hint: string
  keys: ProviderKeyRow[]
  models: ModelRow[]
  created_at: string
  updated_at: string
}

export interface ProviderPayload {
  name: string
  code: string
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
  is_primary?: boolean
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
  updateKey: (id: number, payload: { name?: string; key?: string; is_primary?: boolean; status?: string }) =>
    http.patch<{ data: ProviderKeyRow }>(`/admin/ai-config/keys/${id}`, payload),
  deleteKey: (id: number) => http.delete(`/admin/ai-config/keys/${id}`),
  testKey: (id: number) => http.post<{ data: TestResult }>(`/admin/ai-config/keys/${id}/test`, {}),

  /** 调试调用（识图/对话），走「主 Key + 适配器」完整链路 */
  chat: (payload: { provider_id: number; model: string; prompt: string; image?: { mimeType: string; base64: string } }) =>
    http.post<{ data: ChatDebugResult }>('/admin/ai-config/chat', payload, { timeout: 120_000 }),

  /** 默认识图模型：业务侧（成套生图 AI 识别）共用的识图出口 */
  getDefaultVisionModel: () => http.get<{ data: DefaultVisionSetting | null }>('/admin/ai-config/default-vision-model'),
  setDefaultVisionModel: (payload: { provider_id: number; model_id: string } | null) =>
    http.put<{ data: DefaultVisionSetting | null }>('/admin/ai-config/default-vision-model', payload ?? {}),

  /** 逻辑模型管理（FR2） */
  listLogicalModels: () => http.get<{ data: LogicalModelRow[] }>('/admin/ai-config/logical-models'),
  updateLogicalModel: (id: number, payload: { name: string }) => http.patch<{ data: LogicalModelRow }>(`/admin/ai-config/logical-models/${id}`, payload),

  /** 用户自建渠道只读列表（S1） */
  listUserProviders: () => http.get<{ data: UserProviderRow[] }>('/admin/ai-config/user-providers'),
}
