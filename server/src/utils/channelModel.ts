import { db } from '../db/index.js'
import { decryptKey } from './crypto.js'
import type { ProviderRuntimeConfig } from '../providers/types.js'

/**
 * 渠道模型（ai_models）能力体系共用工具。
 *
 * 能力 JSON 结构（ai_logical_models.default_params / ai_models.param_overrides 共用 schema）：
 *   { resolutions, aspectRatiosByResolution?, aspectRatios?, maxReferenceImages?, maxPromptChars? }
 *
 * 生效能力 = 逻辑模型 default_params ∩ 渠道 param_overrides（覆盖只允许收窄）；
 * 用户完全自定义模型（无 logical_model_id）的 param_overrides 即全量，不做交集校验。
 */

export interface CapabilityParams {
  resolutions: string[]
  aspectRatiosByResolution?: Record<string, string[]>
  aspectRatios?: string[]
  maxReferenceImages?: number
  maxPromptChars?: number
}

export interface ChannelModelRow {
  id: number
  provider_id: number
  model_id: string
  display_name: string
  logical_model_id: number | null
  param_overrides: string | null
  pricing: string | null
  supports_vision: number
  supports_image_gen: number
  supports_chat: number
  status: string
}

export interface ProviderRow {
  id: number
  code: string
  name: string
  base_url: string
  adapter: string
  status: string
  owner_user_id: number | null
}

const ASPECT_RE = /^\d{1,3}:\d{1,3}$/

export function parseParams(json: string | null | undefined): CapabilityParams | null {
  if (!json) return null
  try {
    const obj = JSON.parse(json)
    if (!obj || typeof obj !== 'object') return null
    return obj as CapabilityParams
  } catch {
    return null
  }
}

/** 校验能力 JSON 结构（管理端保存用）；返回错误信息或 null */
export function validateCapabilityParams(p: unknown, opts: { requireFull?: boolean } = {}): string | null {
  if (!p || typeof p !== 'object') return '能力定义必须是 JSON 对象'
  const c = p as CapabilityParams
  if (!Array.isArray(c.resolutions) || c.resolutions.length === 0) return 'resolutions 必须为非空数组'
  if (c.resolutions.some((r) => typeof r !== 'string' || !r.trim())) return 'resolutions 元素必须为字符串'
  if (c.aspectRatiosByResolution !== undefined) {
    if (!c.aspectRatiosByResolution || typeof c.aspectRatiosByResolution !== 'object') return 'aspectRatiosByResolution 必须为对象'
    for (const [res, list] of Object.entries(c.aspectRatiosByResolution)) {
      if (!c.resolutions.includes(res)) return `aspectRatiosByResolution 含未知分辨率键 ${res}`
      if (!Array.isArray(list) || (list as unknown[]).some((a) => typeof a !== 'string' || !ASPECT_RE.test(a))) {
        return `分辨率 ${res} 的宽高比列表格式非法（应为 "w:h" 字符串数组）`
      }
    }
  }
  if (c.aspectRatios !== undefined) {
    if (!Array.isArray(c.aspectRatios) || c.aspectRatios.some((a) => typeof a !== 'string' || !ASPECT_RE.test(a))) {
      return 'aspectRatios 必须为 "w:h" 字符串数组'
    }
  }
  if (opts.requireFull && !c.aspectRatiosByResolution && !c.aspectRatios) {
    return '至少需要 aspectRatios 或 aspectRatiosByResolution 之一'
  }
  if (c.maxReferenceImages !== undefined && (!Number.isFinite(c.maxReferenceImages) || (c.maxReferenceImages as number) < 0)) {
    return 'maxReferenceImages 必须为非负数字'
  }
  if (c.maxPromptChars !== undefined && (!Number.isFinite(c.maxPromptChars) || (c.maxPromptChars as number) < 1)) {
    return 'maxPromptChars 必须为正整数'
  }
  return null
}

function aspectRatiosFor(params: CapabilityParams | null, resolution?: string): string[] {
  if (!params) return []
  if (resolution && params.aspectRatiosByResolution?.[resolution]) {
    return params.aspectRatiosByResolution[resolution]
  }
  return params.aspectRatios ?? []
}

/**
 * 校验 param_overrides 相对逻辑模型能力只收窄不放大（§2.4）。
 * overrides 为空对象/缺字段 = 该维度完全继承。
 */
export function validateOverridesNarrowing(base: CapabilityParams, overrides: CapabilityParams): string | null {
  if (overrides.resolutions) {
    const baseSet = new Set(base.resolutions)
    const bad = overrides.resolutions.find((r) => !baseSet.has(r))
    if (bad) return `能力覆盖只允许收窄：分辨率 ${bad} 不在逻辑模型能力内`
  }
  const effBase = effectiveParams(base, {})
  const checkRatios = (list: string[], baseList: string[], label: string): string | null => {
    const baseSet = new Set(baseList)
    const bad = list.find((a) => !baseSet.has(a))
    return bad ? `${label}：宽高比 ${bad} 不在逻辑模型能力内` : null
  }
  if (overrides.aspectRatios) {
    const err = checkRatios(overrides.aspectRatios, effBase ? allAspectRatios(base) : [], 'aspectRatios')
    if (err) return err
  }
  if (overrides.aspectRatiosByResolution) {
    for (const [res, list] of Object.entries(overrides.aspectRatiosByResolution)) {
      if (!base.resolutions.includes(res)) return `能力覆盖含未知分辨率 ${res}`
      const err = checkRatios(list, aspectRatiosFor(base, res), `分辨率 ${res}`)
      if (err) return err
    }
  }
  if (overrides.maxReferenceImages !== undefined && base.maxReferenceImages !== undefined
    && overrides.maxReferenceImages > base.maxReferenceImages) {
    return `maxReferenceImages 只能收窄（≤ ${base.maxReferenceImages}）`
  }
  if (overrides.maxPromptChars !== undefined && base.maxPromptChars !== undefined
    && overrides.maxPromptChars > base.maxPromptChars) {
    return `maxPromptChars 只能收窄（≤ ${base.maxPromptChars}）`
  }
  return null
}

function allAspectRatios(params: CapabilityParams): string[] {
  const set = new Set<string>(params.aspectRatios ?? [])
  for (const list of Object.values(params.aspectRatiosByResolution ?? {})) {
    for (const a of list) set.add(a)
  }
  return [...set]
}

/** 计算生效能力：base（逻辑模型 default_params）∩ overrides（param_overrides）。空/缺字段 = 该维度完全继承 */
export function effectiveParams(base: CapabilityParams | null, overrides: Partial<CapabilityParams> | null): CapabilityParams {
  const ovr = (overrides && Object.keys(overrides).length > 0) ? overrides : null
  // 用户完全自定义模型（无逻辑模型）：overrides 即全量
  if (!base) {
    return {
      resolutions: ovr?.resolutions ?? [],
      aspectRatiosByResolution: ovr?.aspectRatiosByResolution,
      aspectRatios: ovr?.aspectRatios,
      maxReferenceImages: ovr?.maxReferenceImages ?? 14,
      maxPromptChars: ovr?.maxPromptChars ?? 32000,
    }
  }
  if (!ovr) {
    return {
      resolutions: [...base.resolutions],
      aspectRatiosByResolution: base.aspectRatiosByResolution ? { ...base.aspectRatiosByResolution } : undefined,
      aspectRatios: base.aspectRatios ? [...base.aspectRatios] : undefined,
      maxReferenceImages: base.maxReferenceImages,
      maxPromptChars: base.maxPromptChars,
    }
  }
  const resolutions = ovr.resolutions
    ? base.resolutions.filter((r) => ovr.resolutions!.includes(r))
    : [...base.resolutions]

  let aspectRatiosByResolution: Record<string, string[]> | undefined
  if (ovr.aspectRatiosByResolution) {
    aspectRatiosByResolution = {}
    for (const res of resolutions) {
      const ovrList = ovr.aspectRatiosByResolution[res]
      if (!ovrList) continue // 该分辨率未覆盖 → 继承逻辑模型
      const baseList = aspectRatiosFor(base, res)
      aspectRatiosByResolution[res] = baseList.filter((a) => ovrList.includes(a))
    }
  } else if (ovr.aspectRatios) {
    // 全局收窄：每个分辨率取交集
    aspectRatiosByResolution = {}
    for (const res of resolutions) {
      const baseList = aspectRatiosFor(base, res)
      const filtered = baseList.filter((a) => ovr.aspectRatios!.includes(a))
      if (filtered.length > 0) aspectRatiosByResolution[res] = filtered
    }
  } else if (base.aspectRatiosByResolution) {
    aspectRatiosByResolution = { ...base.aspectRatiosByResolution }
  }

  return {
    resolutions,
    aspectRatiosByResolution,
    aspectRatios: !aspectRatiosByResolution && base.aspectRatios
      ? (ovr.aspectRatios ? base.aspectRatios.filter((a) => ovr.aspectRatios!.includes(a)) : [...base.aspectRatios])
      : undefined,
    maxReferenceImages: ovr.maxReferenceImages !== undefined
      ? Math.min(ovr.maxReferenceImages, base.maxReferenceImages ?? ovr.maxReferenceImages)
      : base.maxReferenceImages,
    maxPromptChars: ovr.maxPromptChars !== undefined
      ? Math.min(ovr.maxPromptChars, base.maxPromptChars ?? ovr.maxPromptChars)
      : base.maxPromptChars,
  }
}

/** 取渠道模型（含渠道行）的生效能力 */
export function getChannelModelCapabilities(model: ChannelModelRow): CapabilityParams | null {
  let base: CapabilityParams | null = null
  if (model.logical_model_id) {
    const logical = db.prepare(`SELECT default_params FROM ai_logical_models WHERE id = ?`).get(model.logical_model_id) as { default_params: string } | undefined
    base = logical ? parseParams(logical.default_params) : null
  }
  const overrides = parseParams(model.param_overrides)
  if (!base && !overrides) return null
  return effectiveParams(base, overrides)
}

export function aspectRatiosAtResolution(params: CapabilityParams, resolution?: string): string[] {
  return aspectRatiosFor(params, resolution)
}

// ── 渠道上下文解析（resolveUserApiKey 的通用化，退役清单 §9）──

export interface ResolvedProviderContext {
  provider: ProviderRow
  config: ProviderRuntimeConfig
}

export class ProviderContextError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message)
    this.name = 'ProviderContextError'
  }
}

/**
 * 解析渠道运行时配置：校验渠道归属（平台渠道任何人可用；用户渠道仅 owner），
 * 取主 Key 解密。明文 Key 只在服务端出站调用中使用，绝不落响应/日志。
 */
export function resolveProviderContext(userId: number, providerId: number, kind: 'image' | 'chat' = 'image'): ResolvedProviderContext {
  const provider = db.prepare(`
    SELECT id, code, name, base_url, adapter, status, owner_user_id FROM api_providers WHERE id = ?
  `).get(providerId) as ProviderRow | undefined
  if (!provider) throw new ProviderContextError('渠道不存在', 404)
  if (provider.owner_user_id !== null && provider.owner_user_id !== userId) {
    throw new ProviderContextError('无权访问该渠道', 403)
  }
  if (provider.status !== 'active') throw new ProviderContextError('渠道已停用', 400)

  const keyRow = db.prepare(`
    SELECT encrypted_key, key_iv, key_tag FROM api_provider_keys
    WHERE provider_id = ? AND is_primary = 1 AND status = 'active'
  `).get(providerId) as { encrypted_key: string; key_iv: string; key_tag: string } | undefined
  if (!keyRow) throw new ProviderContextError('该渠道没有可用的主 Key，请先配置', 400)

  let apiKey: string
  try {
    apiKey = decryptKey({ ciphertext: keyRow.encrypted_key, iv: keyRow.key_iv, tag: keyRow.key_tag })
  } catch {
    throw new ProviderContextError('Key 解密失败（可能加密密钥已轮换），请重新录入', 400)
  }

  return {
    provider,
    config: {
      providerId: provider.id,
      code: provider.code,
      name: provider.name,
      baseUrl: provider.base_url,
      apiKey,
      providerTaskKind: kind,
    },
  }
}

/** 定价 JSON 解析：{"1K":3,"2K":4} */
export function parsePricing(json: string | null | undefined): Record<string, number> | null {
  if (!json) return null
  try {
    const obj = JSON.parse(json)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
      out[k] = v
    }
    return out
  } catch {
    return null
  }
}
