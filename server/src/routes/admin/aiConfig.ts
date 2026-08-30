import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { resolveKeyPlain, maskKey } from '../../utils/crypto.js'
import { getAdapter, listAdapters } from '../../providers/index.js'
import type { ProviderRuntimeConfig, ChatImage } from '../../providers/types.js'
import { DEFAULT_VISION_CONFIG_KEY, getDefaultVisionSetting } from '../../providers/defaultVision.js'
import { validateProviderBaseUrl } from '../../utils/ssrf.js'
import {
  parseParams, validateCapabilityParams, validateOverridesNarrowing, effectiveParams,
} from '../../utils/channelModel.js'
import { getStorageConfig, saveStorageConfig, type OssSettings } from '../../utils/storageConfig.js'
import { uploadToOss, deleteFromOss } from '../../utils/oss.js'

/** 校验能力覆盖相对逻辑模型只收窄（M1-23）；返回错误信息或 null */
function validateOverridesAgainstLogical(logicalModelId: number | null | undefined, overridesJson: string | null): string | null {
  if (!logicalModelId || !overridesJson) return null
  const lm = db.prepare(`SELECT default_params FROM ai_logical_models WHERE id = ?`).get(logicalModelId) as any
  if (!lm) return '逻辑模型不存在'
  const base = parseParams(lm.default_params)
  const overrides = parseParams(overridesJson)
  if (!base || !overrides) return null
  return validateOverridesNarrowing(base, overrides)
}

// ────────────────────────────────────────────────────────────
//  管理后台 ·「配置」页：AI 服务商 / 模型 / Key 池管理
//
//  关系：api_providers 1─N ai_models、api_providers 1─N api_provider_keys。
//  全部为平台渠道（fixed-channels：用户自建渠道已下线）。
//  Key 池：一渠道多 Key，正整数优先级小者优先（priority ASC, id ASC 取第一个可用）；
//  状态 active/disabled/exhausted。exhausted 仅为历史遗留状态（服务端已不再自动写入，项目无权停用用户 Key），仅可通过 active 重新启用。
//  Key 明文存储（key_iv 置空），接口回传完整 Key 供后台查看/复制。
//  实际调用走 providers/ 适配器层，与协议细节解耦。
// ────────────────────────────────────────────────────────────

export const adminAiConfigRouter = Router()
adminAiConfigRouter.use(authMiddleware, adminMiddleware)

// ── 工具函数 ──

function loadProvider(id: string | number | bigint | string[]): any | undefined {
  return db.prepare(`SELECT * FROM api_providers WHERE id = ?`).get(String(id))
}

/** 序列化 Key 行：回传完整明文（明文存储，后台可复制）；历史密文解密失败时 key 为 null */
function serializeKey(row: any) {
  let plain: string | null = null
  try {
    plain = resolveKeyPlain(row)
  } catch {
    plain = null
  }
  return {
    id: row.id,
    provider_id: row.provider_id,
    name: row.name,
    key: plain,
    key_hint: row.key_hint,
    priority: row.priority,
    status: row.status,
    exhausted_at: row.exhausted_at ?? null,
    last_checked_at: row.last_checked_at,
    last_check_ok: row.last_check_ok === null ? null : !!row.last_check_ok,
    created_at: row.created_at,
  }
}

function serializeProvider(row: any) {
  const keys = (db.prepare(`
    SELECT * FROM api_provider_keys WHERE provider_id = ? ORDER BY priority ASC, id ASC
  `).all(row.id) as any[]).map(serializeKey)
  const models = (db.prepare(`
    SELECT m.*, lm.code AS logical_code, lm.name AS logical_name
    FROM ai_models m LEFT JOIN ai_logical_models lm ON lm.id = m.logical_model_id
    WHERE m.provider_id = ? ORDER BY m.id ASC
  `).all(row.id) as any[]).map((m) => ({
    ...m,
    supports_vision: !!m.supports_vision,
    supports_image_gen: !!m.supports_image_gen,
    supports_chat: !!m.supports_chat,
    pricing: (() => { try { return m.pricing ? JSON.parse(m.pricing) : null } catch { return m.pricing } })(),
    param_overrides: parseParams(m.param_overrides),
  }))
  const adapterInfo = (() => { try { return getAdapter(row.adapter) } catch { return undefined } })()
  const firstActive = keys.find((k) => k.status === 'active')
  return {
    ...row,
    keys,
    models,
    adapter_label: adapterInfo?.label ?? `未知适配器(${row.adapter})`,
    first_key_hint: firstActive?.key_hint ?? '',
    has_active_key: !!firstActive,
  }
}

/** 取渠道第一个可用 Key（priority ASC, id ASC；明文仅供服务端出站调用/后台回显） */
function getFirstApiKey(providerId: number): { row: any; plain: string } | null {
  const row = db.prepare(`
    SELECT * FROM api_provider_keys WHERE provider_id = ? AND status = 'active'
    ORDER BY priority ASC, id ASC LIMIT 1
  `).get(providerId) as any
  if (!row) return null
  try {
    const plain = resolveKeyPlain(row)
    return { row, plain }
  } catch {
    return null
  }
}

/** 组装适配器运行时配置（provider 行 + 第一个可用 Key 明文） */
function buildRuntimeConfig(provider: any): { config: ProviderRuntimeConfig; keyRow: any } {
  const pk = getFirstApiKey(provider.id)
  if (!pk) {
    throw new Error('该渠道没有可用 Key（可能所有 Key 已耗尽或停用），请先在「Key 管理」中配置或重新启用')
  }
  return {
    config: {
      providerId: provider.id,
      code: provider.code,
      name: provider.name,
      baseUrl: provider.base_url,
      apiKey: pk.plain,
      keyId: pk.row.id,
    },
    keyRow: pk.row,
  }
}

/** 打回 Key 最近一次连通性检查结果 */
function recordKeyCheck(keyId: number, ok: boolean) {
  db.prepare(`UPDATE api_provider_keys SET last_checked_at = CURRENT_TIMESTAMP, last_check_ok = ? WHERE id = ?`).run(ok ? 1 : 0, keyId)
}

// ── 适配器清单（前端下拉用）──

adminAiConfigRouter.get('/adapters', (_req, res) => {
  res.json({ success: true, data: listAdapters() })
})

// ── 服务商 CRUD ──

// GET /api/admin/ai-config/providers  渠道全量列表（全部为平台渠道）
adminAiConfigRouter.get('/providers', (_req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM api_providers ORDER BY id ASC`).all() as any[]
    res.json({ success: true, data: rows.map(serializeProvider) })
  } catch (err: any) {
    console.error('[admin/ai-config] List providers error:', err.message)
    res.status(500).json({ success: false, error: '加载服务商列表失败' })
  }
})

// POST /api/admin/ai-config/providers
adminAiConfigRouter.post('/providers', async (req: AuthRequest, res) => {
  try {
    const { name, code, base_url, adapter, remark } = req.body || {}
    const trimmedName = String(name || '').trim()
    const trimmedCode = String(code || '').trim().toLowerCase()
    const adapterCode = String(adapter || 'openai_compat').trim()
    if (!trimmedName) { res.status(400).json({ success: false, error: '服务商名称不能为空' }); return }
    if (trimmedCode && !/^[a-z0-9_-]{2,50}$/.test(trimmedCode)) {
      res.status(400).json({ success: false, error: '服务商标识仅限小写字母/数字/中划线/下划线（2~50 位）' }); return
    }
    try { getAdapter(adapterCode) } catch (e: any) {
      res.status(400).json({ success: false, error: e.message }); return
    }
    // SSRF 防护：平台渠道与用户渠道同样校验（M1-11）
    const urlCheck = await validateProviderBaseUrl(String(base_url || ''))
    if (!urlCheck.ok) { res.status(400).json({ success: false, error: urlCheck.error }); return }
    // 标识选填：留空自动生成 provider / provider-2 / ...；填写则查重
    let finalCode = trimmedCode
    if (!finalCode) {
      let seq = 2
      finalCode = 'provider'
      while (db.prepare(`SELECT id FROM api_providers WHERE code = ?`).get(finalCode)) {
        finalCode = `provider-${seq++}`
      }
    } else if (db.prepare(`SELECT id FROM api_providers WHERE code = ?`).get(finalCode)) {
      res.status(409).json({ success: false, error: `服务商标识「${finalCode}」已存在` }); return
    }
    const result = db.prepare(`
      INSERT INTO api_providers (code, name, base_url, adapter, remark) VALUES (?, ?, ?, ?, ?)
    `).run(finalCode, trimmedName, urlCheck.normalized, adapterCode, String(remark || ''))
    res.json({ success: true, data: serializeProvider(loadProvider(result.lastInsertRowid)) })
  } catch (err: any) {
    console.error('[admin/ai-config] Create provider error:', err.message)
    res.status(500).json({ success: false, error: '创建服务商失败' })
  }
})

// PATCH /api/admin/ai-config/providers/:id
adminAiConfigRouter.patch('/providers/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = loadProvider(id)
    if (!row) { res.status(404).json({ success: false, error: '服务商不存在' }); return }
    const { name, base_url, adapter, remark, status } = req.body || {}
    const fields: string[] = []
    const params: any[] = []
    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) { res.status(400).json({ success: false, error: '服务商名称不能为空' }); return }
      fields.push('name = ?'); params.push(trimmed)
    }
    if (base_url !== undefined) {
      const urlCheck = await validateProviderBaseUrl(String(base_url))
      if (!urlCheck.ok) { res.status(400).json({ success: false, error: urlCheck.error }); return }
      fields.push('base_url = ?'); params.push(urlCheck.normalized)
    }
    if (adapter !== undefined) {
      try { getAdapter(String(adapter)) } catch (e: any) {
        res.status(400).json({ success: false, error: e.message }); return
      }
      fields.push('adapter = ?'); params.push(String(adapter))
    }
    if (remark !== undefined) { fields.push('remark = ?'); params.push(String(remark)) }
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) { res.status(400).json({ success: false, error: 'status 仅支持 active/disabled' }); return }
      fields.push('status = ?'); params.push(status)
    }
    if (fields.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }
    params.push(new Date().toISOString(), id)
    db.prepare(`UPDATE api_providers SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params)
    res.json({ success: true, data: serializeProvider(loadProvider(id)) })
  } catch (err: any) {
    console.error('[admin/ai-config] Update provider error:', err.message)
    res.status(500).json({ success: false, error: '更新服务商失败' })
  }
})

// DELETE /api/admin/ai-config/providers/:id  级联删除其模型与 Key
adminAiConfigRouter.delete('/providers/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = loadProvider(id)
    if (!row) { res.status(404).json({ success: false, error: '服务商不存在' }); return }
    // 历史任务通过 channel_provider_id / channel_model_id 外键引用本渠道，且无 ON DELETE 级联：
    // 先解除关联（任务保留，仅不再归属该渠道），否则删除会被外键约束拒绝
    db.prepare(`UPDATE generation_tasks SET channel_provider_id = NULL, channel_model_id = NULL, provider_code = NULL WHERE channel_provider_id = ?`).run(id)
    db.prepare(`DELETE FROM api_providers WHERE id = ?`).run(id)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[admin/ai-config] Delete provider error:', err.message)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// POST /api/admin/ai-config/providers/:id/test  用优先级最高的可用 Key 测试连接
adminAiConfigRouter.post('/providers/:id/test', async (req: AuthRequest, res) => {
  const { id } = req.params
  const row = loadProvider(id)
  if (!row) { res.status(404).json({ success: false, error: '服务商不存在' }); return }
  let runtime: { config: ProviderRuntimeConfig; keyRow: any }
  try {
    runtime = buildRuntimeConfig(row)
  } catch (e: any) {
    res.json({ success: true, data: { ok: false, message: e.message } })
    return
  }
  try {
    // 测试模型优先取该服务商下第一个启用模型，避免适配器兜底模型与账号不匹配
    const firstModel = db.prepare(
      `SELECT model_id FROM ai_models WHERE provider_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1`
    ).get(row.id) as any
    const adapter: any = getAdapter(row.adapter)
    const testFn = (typeof adapter.testImageConnection === 'function' ? adapter.testImageConnection : adapter.testConnection).bind(adapter)
    const result = await testFn(runtime.config, firstModel?.model_id)
    recordKeyCheck(runtime.keyRow.id, result.ok)
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.json({ success: true, data: { ok: false, message: e.message || String(e) } })
  }
})

// ── 模型 CRUD（渠道模型：关联逻辑模型 + 能力覆盖 + 定价）──

function validateModelBody(body: any, forCreate: boolean): { values: any; error?: string } {
  const { provider_id, model_id, display_name, supports_vision, supports_image_gen, supports_chat, remark, status,
          logical_model_id, param_overrides, pricing } = body || {}
  if (forCreate) {
    if (!provider_id || !loadProvider(provider_id)) return { values: null, error: '所属服务商不存在' }
    if (!String(model_id || '').trim()) return { values: null, error: '模型 ID 不能为空' }
  }
  if (supports_image_gen !== undefined && supports_image_gen && supports_vision === false) {
    return { values: null, error: '支持生图的模型必定支持识图，请同时勾选「支持识图」' }
  }
  if (status !== undefined && !['active', 'disabled'].includes(status)) {
    return { values: null, error: 'status 仅支持 active/disabled' }
  }

  // 生图模型必须关联逻辑模型（强校验，§2.3）
  let logicalId: number | null = null
  if (logical_model_id !== undefined) {
    if (logical_model_id === null || logical_model_id === '') {
      logicalId = null
    } else {
      const lm = db.prepare(`SELECT * FROM ai_logical_models WHERE id = ?`).get(logical_model_id) as any
      if (!lm) return { values: null, error: '逻辑模型不存在' }
      logicalId = lm.id
    }
  }

  // 能力覆盖校验（结构 + 只收窄）
  let overridesJson: string | null | undefined
  if (param_overrides !== undefined && param_overrides !== null) {
    const err = validateCapabilityParams(param_overrides)
    if (err) return { values: null, error: `能力覆盖非法：${err}` }
    overridesJson = JSON.stringify(param_overrides)
  } else if (param_overrides === null) {
    overridesJson = null
  }

  // 计算生效能力（用于定价覆盖校验 S6）
  if ((logicalId !== undefined || overridesJson !== undefined || pricing !== undefined)) {
    // 具体校验放到 create/patch 处理器（需要合并旧行），此处先做定价结构校验
    if (pricing !== undefined && pricing !== null) {
      if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
        return { values: null, error: '定价必须是 {分辨率: 积分} 对象' }
      }
      for (const [res, price] of Object.entries(pricing)) {
        if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
          return { values: null, error: `分辨率 ${res} 的定价必须为非负数字` }
        }
      }
    }
  }

  return {
    values: {
      provider_id: forCreate ? Number(provider_id) : undefined,
      model_id: forCreate ? String(model_id).trim() : undefined,
      display_name: String(display_name || '').trim(),
      supports_vision: supports_vision === undefined ? undefined : (supports_vision || supports_image_gen ? 1 : 0),
      supports_image_gen: supports_image_gen === undefined ? undefined : (supports_image_gen ? 1 : 0),
      supports_chat: supports_chat === undefined ? undefined : (supports_chat ? 1 : 0),
      logicalId,
      overridesJson,
      remark: String(remark || ''),
      status,
    },
  }
}

/** 合并旧行计算生效能力并校验定价覆盖（S6：生图模型定价必填且覆盖全部生效分辨率，无豁免） */
function validatePricingCoverage(modelRow: any, logicalId: number | null, overridesJson: string | null, pricingObj: Record<string, number> | null | undefined): string | null {
  const isImage = !!modelRow.supports_image_gen
  if (!isImage) return null
  let base: any = null
  if (logicalId) {
    const lm = db.prepare(`SELECT default_params FROM ai_logical_models WHERE id = ?`).get(logicalId) as any
    base = parseParams(lm?.default_params)
    if (!lm) return '逻辑模型不存在'
  }
  const overrides = parseParams(overridesJson)
  const caps = effectiveParams(base, overrides)
  if (!caps.resolutions.length) return '该模型没有可用分辨率，请配置逻辑模型或能力覆盖'

  const effective = pricingObj !== undefined ? pricingObj : (parseParams(modelRow.pricing) as any)
  if (!effective || typeof effective !== 'object') {
    return '生图模型必须配置定价（按分辨率）'
  }
  for (const res of caps.resolutions) {
    if (typeof (effective as any)[res] !== 'number') {
      return `定价未覆盖分辨率 ${res}（生效能力：${caps.resolutions.join(' / ')}）`
    }
  }
  return null
}

// POST /api/admin/ai-config/models
adminAiConfigRouter.post('/models', (req: AuthRequest, res) => {
  try {
    const { values, error } = validateModelBody(req.body, true)
    if (error) { res.status(400).json({ success: false, error }); return }
    if (!loadProvider(req.body.provider_id)) { res.status(400).json({ success: false, error: '所属服务商不存在' }); return }

    const isImage = !!values.supports_image_gen
    let logicalId = values.logicalId ?? null
    if (isImage && !logicalId) { res.status(400).json({ success: false, error: '生图模型必须关联逻辑模型' }); return }

    // 定价覆盖校验（S6）
    const pseudoRow = { supports_image_gen: values.supports_image_gen ?? 0, pricing: null }
    if (isImage) {
      const narrowErr = validateOverridesAgainstLogical(logicalId, values.overridesJson ?? null)
      if (narrowErr) { res.status(400).json({ success: false, error: `能力覆盖只允许收窄：${narrowErr}` }); return }
      const pricingObj = req.body.pricing ?? null
      const err = validatePricingCoverage(pseudoRow, logicalId, values.overridesJson ?? null, pricingObj)
      if (err) { res.status(400).json({ success: false, error: err }); return }
    }

    const dup = db.prepare(`SELECT id FROM ai_models WHERE provider_id = ? AND model_id = ?`).get(values.provider_id, values.model_id)
    if (dup) { res.status(409).json({ success: false, error: '该服务商下已存在同名模型' }); return }
    const result = db.prepare(`
      INSERT INTO ai_models (provider_id, model_id, display_name, supports_vision, supports_image_gen, supports_chat, logical_model_id, param_overrides, pricing, remark, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      values.provider_id, values.model_id, values.display_name, values.supports_vision ?? 0, values.supports_image_gen ?? 0,
      values.supports_chat ?? 0, logicalId, values.overridesJson ?? null,
      isImage && req.body.pricing ? JSON.stringify(req.body.pricing) : null,
      values.remark, values.status ?? 'active',
    )
    const row = db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(result.lastInsertRowid) as any
    res.json({ success: true, data: { ...row, supports_vision: !!row.supports_vision, supports_image_gen: !!row.supports_image_gen, supports_chat: !!row.supports_chat } })
  } catch (err: any) {
    console.error('[admin/ai-config] Create model error:', err.message)
    res.status(500).json({ success: false, error: '创建模型失败' })
  }
})

// PATCH /api/admin/ai-config/models/:id
adminAiConfigRouter.patch('/models/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(id) as any
    if (!row) { res.status(404).json({ success: false, error: '模型不存在' }); return }
    if (!loadProvider(row.provider_id)) { res.status(404).json({ success: false, error: '所属服务商不存在' }); return }
    const body = { ...req.body }
    // 合并旧值后再做「生图⇒识图」校验（部分更新场景）
    const mergedVision = body.supports_vision !== undefined ? !!body.supports_vision : !!row.supports_vision
    const mergedGen = body.supports_image_gen !== undefined ? !!body.supports_image_gen : !!row.supports_image_gen
    const { values, error } = validateModelBody({ ...body, supports_vision: mergedVision, supports_image_gen: mergedGen }, false)
    if (error) { res.status(400).json({ success: false, error }); return }
    const fields: string[] = []
    const params: any[] = []
    if (body.model_id !== undefined) {
      const trimmed = String(body.model_id).trim()
      if (!trimmed) { res.status(400).json({ success: false, error: '模型 ID 不能为空' }); return }
      const dup = db.prepare(`SELECT id FROM ai_models WHERE provider_id = ? AND model_id = ? AND id != ?`).get(row.provider_id, trimmed, id)
      if (dup) { res.status(409).json({ success: false, error: '该服务商下已存在同名模型' }); return }
      fields.push('model_id = ?'); params.push(trimmed)
    }
    if (body.display_name !== undefined) { fields.push('display_name = ?'); params.push(String(body.display_name).trim()) }
    if (body.supports_vision !== undefined) { fields.push('supports_vision = ?'); params.push(values.supports_vision) }
    if (body.supports_image_gen !== undefined) { fields.push('supports_image_gen = ?'); params.push(values.supports_image_gen) }
    if (body.supports_chat !== undefined) { fields.push('supports_chat = ?'); params.push(values.supports_chat) }
    if (body.logical_model_id !== undefined) {
      if (mergedGen && !values.logicalId) { res.status(400).json({ success: false, error: '生图模型必须关联逻辑模型' }); return }
      fields.push('logical_model_id = ?'); params.push(values.logicalId)
    }
    if (body.param_overrides !== undefined) { fields.push('param_overrides = ?'); params.push(values.overridesJson ?? null) }
    if (body.pricing !== undefined) {
      fields.push('pricing = ?')
      params.push(body.pricing === null ? null : JSON.stringify(body.pricing))
    }
    if (body.remark !== undefined) { fields.push('remark = ?'); params.push(String(body.remark)) }
    if (body.status !== undefined) { fields.push('status = ?'); params.push(body.status) }
    if (fields.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }

    // 定价覆盖校验（合并后的最终状态）
    const finalLogicalId = body.logical_model_id !== undefined ? values.logicalId : row.logical_model_id
    const finalOverrides = body.param_overrides !== undefined ? (values.overridesJson ?? null) : row.param_overrides
    const finalPricing = body.pricing !== undefined ? (body.pricing ?? null) : row.pricing
    const pseudoRow = { supports_image_gen: mergedGen ? 1 : 0, pricing: finalPricing }
    if (mergedGen) {
      const narrowErr = validateOverridesAgainstLogical(finalLogicalId, finalOverrides)
      if (narrowErr) { res.status(400).json({ success: false, error: `能力覆盖只允许收窄：${narrowErr}` }); return }
      let pricingObj: any = undefined
      if (typeof finalPricing === 'string') { try { pricingObj = JSON.parse(finalPricing) } catch { pricingObj = null } }
      else if (finalPricing && typeof finalPricing === 'object') pricingObj = finalPricing
      else if (finalPricing === null) pricingObj = null
      const err = validatePricingCoverage(pseudoRow, finalLogicalId, finalOverrides, pricingObj)
      if (err) { res.status(400).json({ success: false, error: err }); return }
    }

    params.push(new Date().toISOString(), id)
    db.prepare(`UPDATE ai_models SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params)
    const updated = db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(id) as any
    res.json({ success: true, data: { ...updated, supports_vision: !!updated.supports_vision, supports_image_gen: !!updated.supports_image_gen, supports_chat: !!updated.supports_chat } })
  } catch (err: any) {
    console.error('[admin/ai-config] Update model error:', err.message)
    res.status(500).json({ success: false, error: '更新模型失败' })
  }
})

// DELETE /api/admin/ai-config/models/:id
adminAiConfigRouter.delete('/models/:id', (req: AuthRequest, res) => {
  try {
    const row = db.prepare(`SELECT id FROM ai_models WHERE id = ?`).get(req.params.id)
    if (!row) { res.status(404).json({ success: false, error: '模型不存在' }); return }
    db.prepare(`DELETE FROM ai_models WHERE id = ?`).run(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[admin/ai-config] Delete model error:', err.message)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ── Key 池 CRUD ──

/** 校验优先级入参：正整数（S1：小者优先；允许重复，同优先级按 id 稳定排序） */
function parseKeyPriority(v: unknown): { value?: number; error?: string } {
  if (v === undefined || v === null || v === '') return {}
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return { error: '优先级必须是 ≥ 1 的整数（数字越小越先用）' }
  }
  return { value: v }
}

// POST /api/admin/ai-config/keys  { provider_id, name, key, priority? }
adminAiConfigRouter.post('/keys', (req: AuthRequest, res) => {
  try {
    const { provider_id, name, key } = req.body || {}
    const provider = loadProvider(provider_id)
    if (!provider) { res.status(404).json({ success: false, error: '所属服务商不存在' }); return }
    const plain = String(key || '').trim()
    if (!plain) { res.status(400).json({ success: false, error: 'API Key 不能为空' }); return }
    const pri = parseKeyPriority(req.body?.priority)
    if (pri.error) { res.status(400).json({ success: false, error: pri.error }); return }

    // Key 明文存储（key_iv 置空，后台可查看/复制，F7）
    const tx = db.transaction(() => {
      // 新 Key 默认优先级 = 该渠道现有最大 + 1（首个为 1），即默认排到最后（S1）
      const maxRow = db.prepare(`SELECT MAX(priority) AS m FROM api_provider_keys WHERE provider_id = ?`).get(provider_id) as any
      const priority = pri.value ?? (maxRow?.m ?? 0) + 1
      const result = db.prepare(`
        INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, priority, status, created_at, updated_at)
        VALUES (?, ?, ?, '', '', ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(provider_id, String(name || '').trim() || '未命名 Key', plain, maskKey(plain), priority)
      return result.lastInsertRowid
    })
    const keyId = tx() as number
    const row = db.prepare(`SELECT * FROM api_provider_keys WHERE id = ?`).get(keyId) as any
    res.json({ success: true, data: serializeKey(row) })
  } catch (err: any) {
    console.error('[admin/ai-config] Create key error:', err.message)
    res.status(500).json({ success: false, error: '创建 Key 失败' })
  }
})

// PATCH /api/admin/ai-config/keys/:id  { name?, key?(轮换), priority?, status? }
// 状态机（§2.2）：active↔disabled 管理员启停；exhausted→active 重新启用（清 exhausted_at）；
// exhausted 态拒绝改 priority（S4）；exhausted→disabled 不允许
adminAiConfigRouter.patch('/keys/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT * FROM api_provider_keys WHERE id = ?`).get(id) as any
    if (!row) { res.status(404).json({ success: false, error: 'Key 不存在' }); return }
    const { name, key, status } = req.body || {}

    const fields: string[] = []
    const params: any[] = []
    if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim() || '未命名 Key') }
    if (key !== undefined) {
      const plain = String(key).trim()
      if (!plain) { res.status(400).json({ success: false, error: 'API Key 不能为空（留空表示不修改）' }); return }
      // 明文存储（F7）；轮换 Key 值沿用清空最近检测结果
      fields.push('encrypted_key = ?', 'key_iv = ?', 'key_tag = ?', 'key_hint = ?', 'last_check_ok = NULL')
      params.push(plain, '', '', maskKey(plain))
    }
    if (req.body?.priority !== undefined) {
      const pri = parseKeyPriority(req.body.priority)
      if (pri.error) { res.status(400).json({ success: false, error: pri.error }); return }
      if (row.status === 'exhausted') {
        res.status(400).json({ success: false, error: '已耗尽的 Key 不能修改优先级，请先重新启用或删除' }); return
      }
      fields.push('priority = ?'); params.push(pri.value)
    }
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) {
        res.status(400).json({ success: false, error: 'status 仅支持 active/disabled（耗尽态由服务端自动标记，通过 active 重新启用）' }); return
      }
      if (row.status === 'exhausted' && status === 'disabled') {
        res.status(400).json({ success: false, error: '已耗尽的 Key 不能停用：请「重新启用」（active）或删除' }); return
      }
      if (status === 'active') {
        // 重新启用/启用：清空耗尽标记（F4）
        fields.push('status = ?', 'exhausted_at = NULL'); params.push(status)
      } else {
        fields.push('status = ?'); params.push(status)
      }
    }
    if (fields.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }
    params.push(new Date().toISOString(), id)
    db.prepare(`UPDATE api_provider_keys SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params)
    const updated = db.prepare(`SELECT * FROM api_provider_keys WHERE id = ?`).get(id) as any
    res.json({ success: true, data: serializeKey(updated) })
  } catch (err: any) {
    console.error('[admin/ai-config] Update key error:', err.message)
    res.status(500).json({ success: false, error: '更新 Key 失败' })
  }
})

// DELETE /api/admin/ai-config/keys/:id  直接删除（Key 选取动态按优先级，无「自动提升」逻辑）
adminAiConfigRouter.delete('/keys/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT id FROM api_provider_keys WHERE id = ?`).get(id)
    if (!row) { res.status(404).json({ success: false, error: 'Key 不存在' }); return }
    db.prepare(`DELETE FROM api_provider_keys WHERE id = ?`).run(id)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[admin/ai-config] Delete key error:', err.message)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// POST /api/admin/ai-config/keys/:id/test  用指定 Key 测试连接
adminAiConfigRouter.post('/keys/:id/test', async (req: AuthRequest, res) => {
  const { id } = req.params
  const keyRow = db.prepare(`SELECT * FROM api_provider_keys WHERE id = ?`).get(id) as any
  if (!keyRow) { res.status(404).json({ success: false, error: 'Key 不存在' }); return }
  const provider = loadProvider(keyRow.provider_id)
  if (!provider) { res.status(404).json({ success: false, error: '所属服务商不存在' }); return }
  let plain: string
  try {
    plain = resolveKeyPlain(keyRow)
  } catch {
    res.json({ success: true, data: { ok: false, message: 'Key 读取失败（可能加密密钥已轮换），请重新录入该 Key' } })
    return
  }
  try {
    const firstModel = db.prepare(
      `SELECT model_id FROM ai_models WHERE provider_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1`
    ).get(provider.id) as any
    const adapter: any = getAdapter(provider.adapter)
    const testFn = (typeof adapter.testImageConnection === 'function' ? adapter.testImageConnection : adapter.testConnection).bind(adapter)
    const result = await testFn({
      providerId: provider.id, code: provider.code, name: provider.name,
      baseUrl: provider.base_url, apiKey: plain,
    }, firstModel?.model_id)
    recordKeyCheck(keyRow.id, result.ok)
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.json({ success: true, data: { ok: false, message: e.message || String(e) } })
  }
})

// ── 默认识图模型：业务侧（成套生图 AI 识别）共用的识图调用出口 ──

// GET /api/admin/ai-config/default-vision-model
adminAiConfigRouter.get('/default-vision-model', (_req, res) => {
  res.json({ success: true, data: getDefaultVisionSetting() })
})

// PUT /api/admin/ai-config/default-vision-model  { provider_id, model_id }（两者均空 = 清除配置）
adminAiConfigRouter.put('/default-vision-model', (req: AuthRequest, res) => {
  try {
    const { provider_id, model_id } = req.body || {}
    if (!provider_id && !model_id) {
      db.prepare(`UPDATE system_config SET value = '' WHERE key = ?`).run(DEFAULT_VISION_CONFIG_KEY)
      res.json({ success: true, data: null })
      return
    }
    const provider = loadProvider(provider_id)
    if (!provider) { res.status(404).json({ success: false, error: '服务商不存在' }); return }
    if (provider.status !== 'active') { res.status(400).json({ success: false, error: '服务商已停用' }); return }
    const model = db.prepare(`SELECT * FROM ai_models WHERE provider_id = ? AND model_id = ?`)
      .get(provider.id, String(model_id || '').trim()) as any
    if (!model) { res.status(404).json({ success: false, error: '模型不存在' }); return }
    if (model.status !== 'active') { res.status(400).json({ success: false, error: '模型已停用' }); return }
    if (!model.supports_vision) { res.status(400).json({ success: false, error: '该模型不支持识图，请选择支持识图的模型' }); return }
    const value = `${provider.id}:${model.model_id}`
    db.prepare(`INSERT INTO system_config (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(DEFAULT_VISION_CONFIG_KEY, value)
    res.json({ success: true, data: { providerId: provider.id, modelId: model.model_id } })
  } catch (err: any) {
    console.error('[admin/ai-config] Set default vision model error:', err.message)
    res.status(500).json({ success: false, error: '保存默认识图模型失败' })
  }
})

// ── 存储配置：直接传（本机磁盘）vs 阿里云 OSS，含 OSS 密钥（存 DB 不入 git）──

// GET /api/admin/ai-config/storage —— 回传完整配置（admin-only，与 Key 池明文回显先例一致）
adminAiConfigRouter.get('/storage', (_req, res) => {
  res.json({ success: true, data: getStorageConfig() })
})

// PUT /api/admin/ai-config/storage  { mode: 'direct'|'oss', oss?: { endpoint, bucket, accessKeyId, accessKeySecret, resultImportWorkerUrl } }
adminAiConfigRouter.put('/storage', (req: AuthRequest, res) => {
  try {
    const { mode, oss } = req.body || {}
    const saved = saveStorageConfig({ mode, oss })
    res.json({ success: true, data: saved })
  } catch (err: any) {
    console.error('[admin/ai-config] Save storage config error:', err.message)
    res.status(400).json({ success: false, error: err.message || '保存存储配置失败' })
  }
})

// POST /api/admin/ai-config/storage/test —— 用表单当前值（未保存也可测）上传+删除测试对象
adminAiConfigRouter.post('/storage/test', async (req: AuthRequest, res) => {
  const current = getStorageConfig()
  const input = (req.body?.oss || {}) as Partial<OssSettings>
  const overrides: Partial<OssSettings> = {}
  for (const key of Object.keys(current.oss) as (keyof OssSettings)[]) {
    const v = input[key]
    if (typeof v === 'string' && v !== '') overrides[key] = v
  }
  const merged = { ...current.oss, ...overrides }
  if (!merged.bucket || !merged.accessKeyId || !merged.accessKeySecret) {
    res.json({ success: true, data: { ok: false, message: '请先填写完整的 Bucket 与 AccessKey 配置' } })
    return
  }

  const testKey = `__storage_test__/${Date.now()}.txt`
  const started = Date.now()
  try {
    await uploadToOss(Buffer.from('momo-aigc storage config test'), testKey, 'text/plain', merged)
    await deleteFromOss(testKey, merged)
    res.json({ success: true, data: { ok: true, message: `连接成功（${Date.now() - started}ms）：已验证写入与删除权限` } })
  } catch (err: any) {
    res.json({ success: true, data: { ok: false, message: `连接失败：${err.message}` } })
  }
})

// ── 逻辑模型管理（FR2：标准模型抽象，渠道模型共享能力定义）──

function serializeLogicalModel(row: any) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    defaultParams: parseParams(row.default_params) ?? {},
    status: row.status,
    remark: row.remark,
    modelCount: (db.prepare(`SELECT COUNT(*) AS c FROM ai_models WHERE logical_model_id = ?`).get(row.id) as any).c,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// GET /api/admin/ai-config/logical-models
adminAiConfigRouter.get('/logical-models', (_req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM ai_logical_models ORDER BY kind ASC, id ASC`).all() as any[]
    res.json({ success: true, data: rows.map(serializeLogicalModel) })
  } catch (err: any) {
    console.error('[admin/ai-config] List logical models error:', err.message)
    res.status(500).json({ success: false, error: '加载逻辑模型失败' })
  }
})

// POST /api/admin/ai-config/logical-models —— 已下线：逻辑模型由平台代码定义（server/src/db/logicalModels.ts）
adminAiConfigRouter.post('/logical-models', (_req, res) => {
  res.status(410).json({ success: false, error: '逻辑模型由平台代码定义，不支持新增；请修改 server/src/db/logicalModels.ts 后重启' })
})

// PATCH /api/admin/ai-config/logical-models/:id —— 管理员仅可修改显示名
adminAiConfigRouter.patch('/logical-models/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT * FROM ai_logical_models WHERE id = ?`).get(id) as any
    if (!row) { res.status(404).json({ success: false, error: '逻辑模型不存在' }); return }
    const { name, default_params, remark, status } = req.body || {}
    if (default_params !== undefined || remark !== undefined || status !== undefined) {
      res.status(400).json({ success: false, error: '逻辑模型的类型/能力/状态由代码定义，仅支持修改显示名' }); return
    }
    if (name === undefined || !String(name).trim()) {
      res.status(400).json({ success: false, error: '显示名不能为空' }); return
    }
    db.prepare(`UPDATE ai_logical_models SET name = ?, updated_at = ? WHERE id = ?`).run(String(name).trim(), new Date().toISOString(), id)
    const updated = db.prepare(`SELECT * FROM ai_logical_models WHERE id = ?`).get(id) as any
    res.json({ success: true, data: serializeLogicalModel(updated) })
  } catch (err: any) {
    console.error('[admin/ai-config] Update logical model error:', err.message)
    res.status(500).json({ success: false, error: '更新逻辑模型失败' })
  }
})

// DELETE /api/admin/ai-config/logical-models/:id —— 已下线：逻辑模型由平台代码定义
adminAiConfigRouter.delete('/logical-models/:id', (_req, res) => {
  res.status(410).json({ success: false, error: '逻辑模型由平台代码定义，不支持删除' })
})

// ── 调试调用：走「第一个可用 Key + 适配器」完整链路 ──

// POST /api/admin/ai-config/chat  { provider_id, model, prompt, image?: { mimeType, base64 } }
adminAiConfigRouter.post('/chat', async (req: AuthRequest, res) => {
  const { provider_id, model, prompt, image } = req.body || {}
  const provider = loadProvider(provider_id)
  if (!provider) { res.status(404).json({ success: false, error: '服务商不存在' }); return }
  if (!String(model || '').trim()) { res.status(400).json({ success: false, error: '请选择模型' }); return }
  if (!String(prompt || '').trim() && !image) { res.status(400).json({ success: false, error: '提示词与图片不能同时为空' }); return }

  const modelRow = db.prepare(`SELECT * FROM ai_models WHERE provider_id = ? AND model_id = ?`).get(provider_id, String(model).trim()) as any
  if (!modelRow) { res.status(404).json({ success: false, error: `模型「${model}」不存在，请先在模型管理中添加` }); return }
  if (image && !modelRow.supports_vision) {
    res.status(400).json({ success: false, error: `模型「${model}」不支持识图，请去掉图片或更换模型` }); return
  }

  let runtime: { config: ProviderRuntimeConfig; keyRow: any }
  try {
    runtime = buildRuntimeConfig(provider)
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message })
    return
  }

  const images: ChatImage[] = image?.base64
    ? [{ mimeType: image.mimeType || 'image/png', base64: String(image.base64) }]
    : []

  const started = Date.now()
  try {
    const adapter = getAdapter(provider.adapter)
    const result = await adapter.chat({
      model: modelRow.model_id,
      messages: [{ role: 'user', content: String(prompt || '').trim() }],
      images,
      maxTokens: 2048,
    }, runtime.config)
    res.json({
      success: true,
      data: {
        text: result.text,
        reasoning: result.reasoning ?? null,
        usage: result.usage ?? null,
        latencyMs: Date.now() - started,
      },
    })
  } catch (e: any) {
    console.error('[admin/ai-config] Chat error:', e.message)
    res.status(502).json({ success: false, error: e.message || String(e) })
  }
})
