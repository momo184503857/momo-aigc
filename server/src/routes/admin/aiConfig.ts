import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { encryptKey, decryptKey, maskKey } from '../../utils/crypto.js'
import { getAdapter, listAdapters } from '../../providers/index.js'
import type { ProviderRuntimeConfig, ChatImage } from '../../providers/types.js'
import { DEFAULT_VISION_CONFIG_KEY, getDefaultVisionSetting } from '../../providers/defaultVision.js'

// ────────────────────────────────────────────────────────────
//  管理后台 ·「配置」页：AI 服务商 / 模型 / Key 管理
//
//  关系：api_providers 1─N ai_models、api_providers 1─N api_provider_keys。
//  每个服务商唯一一把主 Key（is_primary，部分唯一索引保证），连接调用一律用主 Key。
//  Key 密文 AES-256-GCM 存储，接口永不回传明文（仅脱敏 hint）。
//  实际调用走 providers/ 适配器层，与协议细节解耦。
// ────────────────────────────────────────────────────────────

export const adminAiConfigRouter = Router()
adminAiConfigRouter.use(authMiddleware, adminMiddleware)

// ── 工具函数 ──

function loadProvider(id: string | number | bigint | string[]): any | undefined {
  return db.prepare(`SELECT * FROM api_providers WHERE id = ?`).get(String(id))
}

function serializeProvider(row: any) {
  const keys = (db.prepare(`
    SELECT id, provider_id, name, key_hint, is_primary, status, last_checked_at, last_check_ok, created_at
    FROM api_provider_keys WHERE provider_id = ? ORDER BY is_primary DESC, id ASC
  `).all(row.id) as any[]).map((k) => ({ ...k, is_primary: !!k.is_primary, last_check_ok: k.last_check_ok === null ? null : !!k.last_check_ok }))
  const models = (db.prepare(`
    SELECT * FROM ai_models WHERE provider_id = ? ORDER BY id ASC
  `).all(row.id) as any[]).map((m) => ({ ...m, supports_vision: !!m.supports_vision, supports_image_gen: !!m.supports_image_gen }))
  const adapterInfo = (() => { try { return getAdapter(row.adapter) } catch { return undefined } })()
  return {
    ...row,
    keys,
    models,
    adapter_label: adapterInfo?.label ?? `未知适配器(${row.adapter})`,
    primary_key_hint: keys.find((k) => k.is_primary)?.key_hint ?? '',
  }
}

/** 取服务商主 Key（解密明文仅供服务端出站调用，不落响应） */
function getPrimaryApiKey(providerId: number): { row: any; plain: string } | null {
  const row = db.prepare(`
    SELECT * FROM api_provider_keys WHERE provider_id = ? AND is_primary = 1 AND status = 'active'
  `).get(providerId) as any
  if (!row) return null
  try {
    const plain = decryptKey({ ciphertext: row.encrypted_key, iv: row.key_iv, tag: row.key_tag })
    return { row, plain }
  } catch {
    return null
  }
}

/** 组装适配器运行时配置（provider 行 + 主 Key 明文） */
function buildRuntimeConfig(provider: any): { config: ProviderRuntimeConfig; keyRow: any } {
  const pk = getPrimaryApiKey(provider.id)
  if (!pk) {
    throw new Error('该服务商没有可用的主 Key，请先在「Key 管理」中配置')
  }
  return {
    config: {
      providerId: provider.id,
      code: provider.code,
      name: provider.name,
      baseUrl: provider.base_url,
      apiKey: pk.plain,
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

// GET /api/admin/ai-config/providers  全量列表（含各自 models / keys）
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
adminAiConfigRouter.post('/providers', (req: AuthRequest, res) => {
  try {
    const { name, code, base_url, adapter, remark } = req.body || {}
    const trimmedName = String(name || '').trim()
    const trimmedCode = String(code || '').trim().toLowerCase()
    const trimmedUrl = String(base_url || '').trim()
    const adapterCode = String(adapter || 'openai_compat').trim()
    if (!trimmedName) { res.status(400).json({ success: false, error: '服务商名称不能为空' }); return }
    if (!/^[a-z0-9_-]{2,50}$/.test(trimmedCode)) {
      res.status(400).json({ success: false, error: '服务商标识仅限小写字母/数字/中划线/下划线（2~50 位）' }); return
    }
    if (!/^https?:\/\//.test(trimmedUrl)) { res.status(400).json({ success: false, error: 'Base URL 必须以 http(s):// 开头' }); return }
    try { getAdapter(adapterCode) } catch (e: any) {
      res.status(400).json({ success: false, error: e.message }); return
    }
    if (db.prepare(`SELECT id FROM api_providers WHERE code = ?`).get(trimmedCode)) {
      res.status(409).json({ success: false, error: `服务商标识「${trimmedCode}」已存在` }); return
    }
    const result = db.prepare(`
      INSERT INTO api_providers (code, name, base_url, adapter, remark) VALUES (?, ?, ?, ?, ?)
    `).run(trimmedCode, trimmedName, trimmedUrl, adapterCode, String(remark || ''))
    res.json({ success: true, data: serializeProvider(loadProvider(result.lastInsertRowid)) })
  } catch (err: any) {
    console.error('[admin/ai-config] Create provider error:', err.message)
    res.status(500).json({ success: false, error: '创建服务商失败' })
  }
})

// PATCH /api/admin/ai-config/providers/:id
adminAiConfigRouter.patch('/providers/:id', (req: AuthRequest, res) => {
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
      const trimmed = String(base_url).trim()
      if (!/^https?:\/\//.test(trimmed)) { res.status(400).json({ success: false, error: 'Base URL 必须以 http(s):// 开头' }); return }
      fields.push('base_url = ?'); params.push(trimmed)
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
    db.prepare(`DELETE FROM api_providers WHERE id = ?`).run(id)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[admin/ai-config] Delete provider error:', err.message)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// POST /api/admin/ai-config/providers/:id/test  用主 Key 测试连接
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
    const adapter = getAdapter(row.adapter)
    const result = await adapter.testConnection(runtime.config, firstModel?.model_id)
    recordKeyCheck(runtime.keyRow.id, result.ok)
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.json({ success: true, data: { ok: false, message: e.message || String(e) } })
  }
})

// ── 模型 CRUD ──

function validateModelBody(body: any, forCreate: boolean): { values: any; error?: string } {
  const { provider_id, model_id, display_name, supports_vision, supports_image_gen, remark, status } = body || {}
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
  return {
    values: {
      provider_id: forCreate ? Number(provider_id) : undefined,
      model_id: forCreate ? String(model_id).trim() : undefined,
      display_name: String(display_name || '').trim(),
      supports_vision: supports_vision === undefined ? undefined : (supports_vision || supports_image_gen ? 1 : 0),
      supports_image_gen: supports_image_gen === undefined ? undefined : (supports_image_gen ? 1 : 0),
      remark: String(remark || ''),
      status,
    },
  }
}

// POST /api/admin/ai-config/models
adminAiConfigRouter.post('/models', (req: AuthRequest, res) => {
  try {
    const { values, error } = validateModelBody(req.body, true)
    if (error) { res.status(400).json({ success: false, error }); return }
    const dup = db.prepare(`SELECT id FROM ai_models WHERE provider_id = ? AND model_id = ?`).get(values.provider_id, values.model_id)
    if (dup) { res.status(409).json({ success: false, error: '该服务商下已存在同名模型' }); return }
    const result = db.prepare(`
      INSERT INTO ai_models (provider_id, model_id, display_name, supports_vision, supports_image_gen, remark, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(values.provider_id, values.model_id, values.display_name, values.supports_vision ?? 0, values.supports_image_gen ?? 0, values.remark, values.status ?? 'active')
    const row = db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(result.lastInsertRowid) as any
    res.json({ success: true, data: { ...row, supports_vision: !!row.supports_vision, supports_image_gen: !!row.supports_image_gen } })
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
    if (body.remark !== undefined) { fields.push('remark = ?'); params.push(String(body.remark)) }
    if (body.status !== undefined) { fields.push('status = ?'); params.push(body.status) }
    if (fields.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }
    params.push(new Date().toISOString(), id)
    db.prepare(`UPDATE ai_models SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params)
    const updated = db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(id) as any
    res.json({ success: true, data: { ...updated, supports_vision: !!updated.supports_vision, supports_image_gen: !!updated.supports_image_gen } })
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

// ── Key CRUD ──

function clearOtherPrimaryKeys(providerId: number, exceptKeyId?: number) {
  db.prepare(`UPDATE api_provider_keys SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE provider_id = ? AND is_primary = 1 AND id != ?`)
    .run(providerId, exceptKeyId ?? -1)
}

/** 删除主 Key 后，自动把剩下最早的启用 Key 提升为主 Key */
function promoteNextPrimaryKey(providerId: number) {
  const next = db.prepare(`
    SELECT id FROM api_provider_keys WHERE provider_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1
  `).get(providerId) as any
  if (next) {
    db.prepare(`UPDATE api_provider_keys SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(next.id)
  }
}

// POST /api/admin/ai-config/keys  { provider_id, name, key, is_primary }
adminAiConfigRouter.post('/keys', (req: AuthRequest, res) => {
  try {
    const { provider_id, name, key, is_primary } = req.body || {}
    const provider = loadProvider(provider_id)
    if (!provider) { res.status(404).json({ success: false, error: '所属服务商不存在' }); return }
    const plain = String(key || '').trim()
    if (!plain) { res.status(400).json({ success: false, error: 'API Key 不能为空' }); return }

    const enc = encryptKey(plain)
    const tx = db.transaction(() => {
      const makePrimary = is_primary !== false // 新增默认设为主（尤其服务商还没有主 Key 时）
      const hasPrimary = !!db.prepare(`SELECT id FROM api_provider_keys WHERE provider_id = ? AND is_primary = 1`).get(provider_id)
      const finalPrimary = makePrimary || !hasPrimary
      if (finalPrimary) clearOtherPrimaryKeys(provider_id)
      const result = db.prepare(`
        INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(provider_id, String(name || '').trim() || '未命名 Key', enc.ciphertext, enc.iv, enc.tag, maskKey(plain), finalPrimary ? 1 : 0)
      return result.lastInsertRowid
    })
    const keyId = tx() as number
    const row = db.prepare(`
      SELECT id, provider_id, name, key_hint, is_primary, status, last_checked_at, last_check_ok, created_at
      FROM api_provider_keys WHERE id = ?
    `).get(keyId) as any
    res.json({ success: true, data: { ...row, is_primary: !!row.is_primary } })
  } catch (err: any) {
    console.error('[admin/ai-config] Create key error:', err.message)
    res.status(500).json({ success: false, error: '创建 Key 失败' })
  }
})

// PATCH /api/admin/ai-config/keys/:id  { name?, key?(轮换), is_primary?, status? }
adminAiConfigRouter.patch('/keys/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT * FROM api_provider_keys WHERE id = ?`).get(id) as any
    if (!row) { res.status(404).json({ success: false, error: 'Key 不存在' }); return }
    const { name, key, is_primary, status } = req.body || {}

    const fields: string[] = []
    const params: any[] = []
    if (name !== undefined) { fields.push('name = ?'); params.push(String(name).trim() || '未命名 Key') }
    if (key !== undefined) {
      const plain = String(key).trim()
      if (!plain) { res.status(400).json({ success: false, error: 'API Key 不能为空（留空表示不修改）' }); return }
      const enc = encryptKey(plain)
      fields.push('encrypted_key = ?', 'key_iv = ?', 'key_tag = ?', 'key_hint = ?', 'last_check_ok = NULL')
      params.push(enc.ciphertext, enc.iv, enc.tag, maskKey(plain))
    }
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) { res.status(400).json({ success: false, error: 'status 仅支持 active/disabled' }); return }
      if (row.is_primary && status === 'disabled') {
        res.status(400).json({ success: false, error: '主 Key 不可停用，请先把其他 Key 设为主 Key' }); return
      }
      fields.push('status = ?'); params.push(status)
    }
    if (is_primary !== undefined) {
      if (is_primary) {
        if (row.status !== 'active') { res.status(400).json({ success: false, error: '停用状态的 Key 不能设为主 Key' }); return }
        clearOtherPrimaryKeys(row.provider_id, row.id)
        fields.push('is_primary = 1')
      } else if (row.is_primary) {
        res.status(400).json({ success: false, error: '必须保留一把主 Key：请把其他 Key 设为主 Key，而不是取消当前主 Key' }); return
      } else {
        fields.push('is_primary = 0')
      }
    }
    if (fields.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }
    params.push(new Date().toISOString(), id)
    db.prepare(`UPDATE api_provider_keys SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params)
    const updated = db.prepare(`
      SELECT id, provider_id, name, key_hint, is_primary, status, last_checked_at, last_check_ok, created_at
      FROM api_provider_keys WHERE id = ?
    `).get(id) as any
    res.json({ success: true, data: { ...updated, is_primary: !!updated.is_primary, last_check_ok: updated.last_check_ok === null ? null : !!updated.last_check_ok } })
  } catch (err: any) {
    console.error('[admin/ai-config] Update key error:', err.message)
    res.status(500).json({ success: false, error: '更新 Key 失败' })
  }
})

// DELETE /api/admin/ai-config/keys/:id
adminAiConfigRouter.delete('/keys/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT * FROM api_provider_keys WHERE id = ?`).get(id) as any
    if (!row) { res.status(404).json({ success: false, error: 'Key 不存在' }); return }
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM api_provider_keys WHERE id = ?`).run(id)
      if (row.is_primary) promoteNextPrimaryKey(row.provider_id)
    })
    tx()
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
    plain = decryptKey({ ciphertext: keyRow.encrypted_key, iv: keyRow.key_iv, tag: keyRow.key_tag })
  } catch {
    res.json({ success: true, data: { ok: false, message: 'Key 解密失败（可能加密密钥已轮换），请重新录入该 Key' } })
    return
  }
  try {
    const firstModel = db.prepare(
      `SELECT model_id FROM ai_models WHERE provider_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1`
    ).get(provider.id) as any
    const adapter = getAdapter(provider.adapter)
    const result = await adapter.testConnection({
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

// ── 调试调用：走「主 Key + 适配器」完整链路 ──

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
