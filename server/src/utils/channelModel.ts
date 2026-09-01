import { db } from '../db/index.js'
import { resolveKeyPlain } from './crypto.js'
import { ProviderCallError } from '../providers/http.js'
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
  /** 渠道像素尺寸硬限制（openai_image 系渠道实测限制，如 relayrouter 单边≤3840 且总像素≤8294400）；
   *  适配器把 toPixelSize 结果等比缩到约束内。逻辑模型不定义此维度，属渠道级附加配置 */
  sizeClamp?: { maxEdge?: number; maxPixels?: number }
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
  if (c.sizeClamp !== undefined) {
    const sc = c.sizeClamp
    if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return 'sizeClamp 必须为对象 { maxEdge?, maxPixels? }'
    if (sc.maxEdge !== undefined && (!Number.isFinite(sc.maxEdge) || sc.maxEdge < 16)) return 'sizeClamp.maxEdge 必须为 ≥16 的数字'
    if (sc.maxPixels !== undefined && (!Number.isFinite(sc.maxPixels) || sc.maxPixels < 256)) return 'sizeClamp.maxPixels 必须为 ≥256 的数字'
    if (sc.maxEdge === undefined && sc.maxPixels === undefined) return 'sizeClamp 至少需要 maxEdge 或 maxPixels 之一'
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

// ── 渠道上下文解析与 Key 池轮换（fixed-channels：渠道全部为平台渠道，Key 按优先级选取）──

export interface ResolvedProviderContext {
  provider: ProviderRow
  config: ProviderRuntimeConfig
}

export class ProviderContextError extends Error {
  /** NO_KEY=渠道无可用 Key（全部停用/未配置/历史耗尽标记）；ALL_TRIED=本轮请求已试遍全部 Key（内部控制流信号） */
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: 'NO_KEY' | 'ALL_TRIED' = 'NO_KEY',
  ) {
    super(message)
    this.name = 'ProviderContextError'
  }
}

/**
 * 解析渠道运行时配置：校验渠道状态，按 `priority ASC, id ASC` 取第一个可用 Key
 * （明文存储，见 resolveKeyPlain）。
 *
 * opts.excludeKeyIds 仅供 withKeyFailover 的轮换使用（跳过本次请求已试过的 Key）；
 * opts.preferKeyId 供轮询/转存等直连路径指定任务提交时实际使用的 Key
 * （toapis 等渠道任务按 Key 隔离，用其他 Key 查询会得到 task_not_exist；
 * 该 Key 已停用/删除时自动回退到优先级最高的可用 Key）。
 */
export function resolveProviderContext(
  providerId: number,
  kind: 'image' | 'chat' = 'image',
  opts: { excludeKeyIds?: ReadonlySet<number>; preferKeyId?: number | null } = {},
): ResolvedProviderContext {
  const provider = db.prepare(`
    SELECT id, code, name, base_url, adapter, status FROM api_providers WHERE id = ?
  `).get(providerId) as ProviderRow | undefined
  if (!provider) throw new ProviderContextError('渠道不存在', 404)
  if (provider.status !== 'active') throw new ProviderContextError('渠道已停用', 400)

  const keyRows = db.prepare(`
    SELECT id AS key_id, encrypted_key, key_iv, key_tag FROM api_provider_keys
    WHERE provider_id = ? AND status = 'active'
    ORDER BY priority ASC, id ASC
  `).all(providerId) as Array<{ key_id: number; encrypted_key: string; key_iv: string; key_tag: string }>
  if (keyRows.length === 0) {
    throw new ProviderContextError('该渠道没有可用 Key（可能所有 Key 已停用，或为历史遗留的耗尽标记，请在 Key 管理中重新启用）', 400)
  }

  const keyRow = (opts.preferKeyId != null ? keyRows.find((k) => k.key_id === opts.preferKeyId) : undefined)
    ?? keyRows.find((k) => !opts.excludeKeyIds?.has(k.key_id))
  if (!keyRow) throw new ProviderContextError('本轮请求已试遍该渠道全部可用 Key', 400, 'ALL_TRIED')

  let apiKey: string
  try {
    apiKey = resolveKeyPlain(keyRow)
  } catch {
    throw new ProviderContextError('Key 读取失败（可能加密密钥已轮换），请重新录入', 400)
  }

  return {
    provider,
    config: {
      providerId: provider.id,
      code: provider.code,
      name: provider.name,
      baseUrl: provider.base_url,
      apiKey,
      keyId: keyRow.key_id,
      providerTaskKind: kind,
    },
  }
}

// ── Key 轮换（仅“本次请求”内换 Key 重试；项目无权因上游报错停用/拦截用户的 Key）──

/**
 * 配额/欠费类错误判定：仅用于决定**本次请求**是否换下一个 Key 重试。
 *
 * 判定结果不落库、不冷却、不限制后续请求——每个新请求始终从优先级最高的可用 Key 开始。
 * 渠道只有一个 Key 时轮换自然退化为：把上游原始报错透传给用户（任务失败 + 全额退款），
 * 由用户根据报错自行处理（等额度恢复 / 充值 / 换 Key）。
 *
 * 信号（状态码为主，400/403 需文案佐证）：
 * - HTTP 402（欠费）/ 429（限流：每日额度、频率限制等）；
 * - 400/403 且文案含 余额/欠费/quota/额度/次数/rate limit/频繁/用完 等
 *   （部分中转站把配额用完报成 400「insufficient quota」）。
 * 401（Key 失效）/ 5xx / 网络错误不轮换——换 Key 大概率无济于事，避免误判。
 */
const QUOTA_SIGNAL_RE = /余额|欠费|欠款|balance|arrear|billing|rate.?limit|too\s+many\s+requests|请求过于频繁|访问频繁|频繁|限流|限速|每[日天小时分]|daily|per\s*(day|hour|minute)|quota|额度|配额|次数|exceeded|exhaust|用完|耗尽|上限|limit/i

export function isQuotaRotateSignal(e: unknown): boolean {
  if (!(e instanceof ProviderCallError)) return false
  if (e.status === 402 || e.status === 429) return true
  if (e.status === 400 || e.status === 403) return QUOTA_SIGNAL_RE.test(e.message || '')
  return false
}

/**
 * 带 Key 轮换的调用包装：命中配额/欠费信号 → **仅本次请求**换下一个可用 Key 重试
 * （无退避；循环上限 = 渠道可用 Key 数）。不写库、不停用、不冷却任何 Key。
 *
 * 试遍全部 Key 仍失败时，把**上游最后一次的原始报错**原样抛给调用方（而非笼统的
 * 「无可用 Key」）——用户看到的就是自己 API 返回的错误信息。非配额类错误原样抛出；
 * 渠道本就没有可用 Key 时由 resolveProviderContext 抛 ProviderContextError（NO_KEY，
 * 生图转译为 ALL_KEYS_EXHAUSTED）。
 */
export async function withKeyFailover<T>(
  providerId: number,
  kind: 'image' | 'chat',
  fn: (ctx: ProviderRuntimeConfig) => Promise<T>,
): Promise<T> {
  const tried = new Set<number>()
  let lastQuotaError: unknown = null
  for (;;) {
    let config: ProviderRuntimeConfig
    try {
      ({ config } = resolveProviderContext(providerId, kind, { excludeKeyIds: tried }))
    } catch (e) {
      // 本请求已试遍全部 Key → 透传上游最后一次的原始报错；首轮即无 Key 则抛配置错误
      if (e instanceof ProviderContextError && e.code === 'ALL_TRIED' && lastQuotaError !== null) {
        throw lastQuotaError
      }
      throw e
    }
    try {
      return await fn(config)
    } catch (e) {
      if (config.keyId === undefined || !isQuotaRotateSignal(e)) throw e
      tried.add(config.keyId)
      lastQuotaError = e
      // continue：本轮换下一个 Key 重试（单 Key 渠道下一轮即透传本错误）
    }
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
