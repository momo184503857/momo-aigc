import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { encryptKey, decryptKey, maskKey } from '../utils/crypto.js'
import { getAdapter, getImageAdapter, listAdapters, CHANNEL_ADAPTER_WHITELIST } from '../providers/index.js'
import { validateProviderBaseUrl } from '../utils/ssrf.js'
import {
  parseParams, validateCapabilityParams, validateOverridesNarrowing, effectiveParams,
} from '../utils/channelModel.js'

/**
 * 我的渠道（用户自建渠道，ai-provider §5.2）。
 *
 * 渠道 CRUD + Key 管理 + 测试连通 + 余额查询（仅 toapis）+ 渠道模型 CRUD。
 * 安全（S7）：base_url 仅 http/https 且拒绝私网 IP（SSRF 基本防护）；
 * Key AES-256-GCM 加密、明文永不回传；所有上游调用由服务端发出。
 * 隔离（M4-06）：渠道仅本人可见，越权访问 403/404。
 */

export const myChannelsRouter = Router()
myChannelsRouter.use(authMiddleware)

// ── 工具 ──

function loadMyChannel(userId: number, id: string | number | string[]) {
  const row = db.prepare(`SELECT * FROM api_providers WHERE id = ? AND owner_user_id = ?`).get(String(id), userId) as any
  return row
}

function serializeChannel(row: any) {
  const key = db.prepare(`
    SELECT id, name, key_hint, is_primary, status, last_checked_at, last_check_ok
    FROM api_provider_keys WHERE provider_id = ? AND is_primary = 1
  `).get(row.id) as any
  const modelCount = (db.prepare(`SELECT COUNT(*) AS c FROM ai_models WHERE provider_id = ?`).get(row.id) as any).c
  const adapterInfo = (() => { try { return getAdapter(row.adapter) } catch { return undefined } })()
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    baseUrl: row.base_url,
    adapter: row.adapter,
    adapterLabel: adapterInfo?.label ?? row.adapter,
    status: row.status,
    remark: row.remark,
    balanceCheckIntervalSec: row.balance_check_interval_sec ?? 60,
    modelCount,
    keyHint: key?.key_hint ?? '',
    keyStatus: key?.status ?? null,
    lastCheckedAt: key?.last_checked_at ?? null,
    lastCheckOk: key?.last_check_ok === undefined || key?.last_check_ok === null ? null : !!key.last_check_ok,
    supportsBalance: !!(adapterInfo as any)?.supportsBalance,
    createdAt: row.created_at,
  }
}

function serializeModel(row: any) {
  let logicalCode: string | null = null
  let baseParams: any = null
  if (row.logical_model_id) {
    const lm = db.prepare(`SELECT code, default_params FROM ai_logical_models WHERE id = ?`).get(row.logical_model_id) as any
    if (lm) { logicalCode = lm.code; baseParams = parseParams(lm.default_params) }
  }
  const overrides = parseParams(row.param_overrides)
  const caps = effectiveParams(baseParams, overrides)
  return {
    id: row.id,
    modelId: row.model_id,
    displayName: row.display_name || logicalCode || row.model_id,
    logicalModelId: row.logical_model_id ?? null,
    logicalCode,
    paramOverrides: overrides,
    capabilities: row.supports_image_gen ? caps : null,
    supportsImageGen: !!row.supports_image_gen,
    supportsChat: !!row.supports_chat,
    status: row.status,
    remark: row.remark,
  }
}

async function assertValidAdapterAndUrl(adapter: string, baseUrl: string) {
  const adapterCode = String(adapter || '').trim()
  if (!CHANNEL_ADAPTER_WHITELIST.includes(adapterCode)) {
    return { error: `协议模板仅支持：${CHANNEL_ADAPTER_WHITELIST.join(' / ')}` }
  }
  try { getAdapter(adapterCode) } catch (e: any) {
    return { error: e.message }
  }
  const urlCheck = await validateProviderBaseUrl(baseUrl)
  if (!urlCheck.ok) return { error: urlCheck.error! }
  return { adapterCode, baseUrl: urlCheck.normalized }
}

function genChannelCode(userId: number): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `u${userId}-${rand}`
}

// ── 渠道列表 / CRUD ──

myChannelsRouter.get('/channels', (req: AuthRequest, res) => {
  const rows = db.prepare(`SELECT * FROM api_providers WHERE owner_user_id = ? ORDER BY id ASC`).all(req.user!.userId) as any[]
  res.json({ success: true, data: rows.map(serializeChannel) })
})

myChannelsRouter.post('/channels', async (req: AuthRequest, res) => {
  try {
    const { name, adapter, baseUrl, key, remark } = req.body || {}
    const trimmedName = String(name || '').trim()
    if (!trimmedName) { res.status(400).json({ success: false, error: '渠道名称不能为空' }); return }
    const plain = String(key || '').trim()
    if (!plain) { res.status(400).json({ success: false, error: 'API Key 不能为空' }); return }

    const check = await assertValidAdapterAndUrl(adapter, baseUrl)
    if (check.error) { res.status(400).json({ success: false, error: check.error }); return }

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO api_providers (code, name, base_url, adapter, remark, status, owner_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(genChannelCode(req.user!.userId), trimmedName, check.baseUrl, check.adapterCode, String(remark || ''), req.user!.userId)
      const providerId = Number(result.lastInsertRowid)
      const enc = encryptKey(plain)
      db.prepare(`
        INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, is_primary, status, created_at, updated_at)
        VALUES (?, '主 Key', ?, ?, ?, ?, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(providerId, enc.ciphertext, enc.iv, enc.tag, maskKey(plain))
      return providerId
    })
    const providerId = tx() as number
    res.json({ success: true, data: serializeChannel(loadMyChannel(req.user!.userId, providerId)) })
  } catch (err: any) {
    console.error('[my-channels] Create error:', err.message)
    res.status(500).json({ success: false, error: '创建渠道失败' })
  }
})

myChannelsRouter.patch('/channels/:id', async (req: AuthRequest, res) => {
  try {
    const row = loadMyChannel(req.user!.userId, req.params.id)
    if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
    const { name, baseUrl, adapter, remark, status, balanceCheckIntervalSec } = req.body || {}
    const fields: string[] = []
    const params: any[] = []
    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) { res.status(400).json({ success: false, error: '渠道名称不能为空' }); return }
      fields.push('name = ?'); params.push(trimmed)
    }
    if (baseUrl !== undefined) {
      const check = await assertValidAdapterAndUrl(adapter ?? row.adapter, baseUrl)
      if (check.error) { res.status(400).json({ success: false, error: check.error }); return }
      fields.push('base_url = ?'); params.push(check.baseUrl)
    }
    if (adapter !== undefined) {
      const adapterCode = String(adapter).trim()
      if (!CHANNEL_ADAPTER_WHITELIST.includes(adapterCode)) {
        res.status(400).json({ success: false, error: `协议模板仅支持：${CHANNEL_ADAPTER_WHITELIST.join(' / ')}` }); return
      }
      fields.push('adapter = ?'); params.push(adapterCode)
    }
    if (remark !== undefined) { fields.push('remark = ?'); params.push(String(remark)) }
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) { res.status(400).json({ success: false, error: 'status 仅支持 active/disabled' }); return }
      fields.push('status = ?'); params.push(status)
    }
    if (balanceCheckIntervalSec !== undefined) {
      const n = Number(balanceCheckIntervalSec)
      if (!Number.isFinite(n) || n < 0 || n > 604800) { res.status(400).json({ success: false, error: '余额轮询间隔必须是 0~604800 秒' }); return }
      fields.push('balance_check_interval_sec = ?'); params.push(Math.floor(n))
    }
    if (fields.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }
    params.push(new Date().toISOString(), req.params.id)
    db.prepare(`UPDATE api_providers SET ${fields.join(', ')}, updated_at = ? WHERE id = ? AND owner_user_id = ?`)
      .run(...params, req.user!.userId)
    res.json({ success: true, data: serializeChannel(loadMyChannel(req.user!.userId, req.params.id)) })
  } catch (err: any) {
    console.error('[my-channels] Update error:', err.message)
    res.status(500).json({ success: false, error: '更新渠道失败' })
  }
})

myChannelsRouter.delete('/channels/:id', (req: AuthRequest, res) => {
  const row = loadMyChannel(req.user!.userId, req.params.id)
  if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
  // 级联删除渠道模型与 Key；历史任务保留快照（provider_code/model 字符串仍在）
  db.prepare(`DELETE FROM api_providers WHERE id = ? AND owner_user_id = ?`).run(req.params.id, req.user!.userId)
  res.json({ success: true })
})

// ── Key 管理 ──

myChannelsRouter.put('/channels/:id/key', (req: AuthRequest, res) => {
  const row = loadMyChannel(req.user!.userId, req.params.id)
  if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
  const plain = String(req.body?.key || '').trim()
  if (!plain) { res.status(400).json({ success: false, error: 'API Key 不能为空' }); return }
  const enc = encryptKey(plain)
  const tx = db.transaction(() => {
    const existing = db.prepare(`SELECT id FROM api_provider_keys WHERE provider_id = ? AND is_primary = 1`).get(row.id) as any
    if (existing) {
      db.prepare(`
        UPDATE api_provider_keys SET encrypted_key = ?, key_iv = ?, key_tag = ?, key_hint = ?, last_check_ok = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(enc.ciphertext, enc.iv, enc.tag, maskKey(plain), existing.id)
    } else {
      db.prepare(`
        INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, is_primary, status, created_at, updated_at)
        VALUES (?, '主 Key', ?, ?, ?, ?, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(row.id, enc.ciphertext, enc.iv, enc.tag, maskKey(plain))
    }
  })
  tx()
  res.json({ success: true, data: { keyHint: maskKey(plain) } })
})

// ── 测试连通 / 余额 ──

function buildRuntime(row: any): { apiKey: string } | { error: string } {
  const keyRow = db.prepare(`
    SELECT encrypted_key, key_iv, key_tag FROM api_provider_keys
    WHERE provider_id = ? AND is_primary = 1 AND status = 'active'
  `).get(row.id) as any
  if (!keyRow) return { error: '该渠道尚未配置主 Key' }
  try {
    return { apiKey: decryptKey({ ciphertext: keyRow.encrypted_key, iv: keyRow.key_iv, tag: keyRow.key_tag }) }
  } catch {
    return { error: 'Key 解密失败（可能加密密钥已轮换），请重新录入' }
  }
}

function recordCheck(providerId: number, ok: boolean) {
  db.prepare(`
    UPDATE api_provider_keys SET last_checked_at = CURRENT_TIMESTAMP, last_check_ok = ?
    WHERE provider_id = ? AND is_primary = 1
  `).run(ok ? 1 : 0, providerId)
}

myChannelsRouter.post('/channels/:id/test', async (req: AuthRequest, res) => {
  const row = loadMyChannel(req.user!.userId, req.params.id)
  if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
  const rt = buildRuntime(row)
  if ('error' in rt) { res.json({ success: true, data: { ok: false, message: rt.error } }); return }

  const firstModel = db.prepare(`
    SELECT model_id FROM ai_models WHERE provider_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1
  `).get(row.id) as any

  try {
    const ctx = {
      providerId: row.id, code: row.code, name: row.name,
      baseUrl: row.base_url, apiKey: rt.apiKey,
      providerTaskKind: 'image' as const,
    }
    let adapter: any
    try { adapter = getImageAdapter(row.adapter) } catch { adapter = getAdapter(row.adapter) }
    const fn = adapter.testImageConnection ?? adapter.testConnection
    const result = await fn.call(adapter, ctx, firstModel?.model_id)
    recordCheck(row.id, result.ok)
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.json({ success: true, data: { ok: false, message: e.message || String(e) } })
  }
})

myChannelsRouter.get('/channels/:id/balance', async (req: AuthRequest, res) => {
  const row = loadMyChannel(req.user!.userId, req.params.id)
  if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
  let adapter: any
  try { adapter = getImageAdapter(row.adapter) } catch { adapter = getAdapter(row.adapter) }
  if (!adapter.supportsBalance || typeof adapter.queryBalance !== 'function') {
    res.status(400).json({ success: false, error: '该协议不支持余额查询' })
    return
  }
  const rt = buildRuntime(row)
  if ('error' in rt) { res.status(400).json({ success: false, error: rt.error }); return }
  try {
    const result = await adapter.queryBalance({
      providerId: row.id, code: row.code, name: row.name, baseUrl: row.base_url, apiKey: rt.apiKey,
    })
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.status(502).json({ success: false, error: e.message || String(e) })
  }
})

// ── 渠道模型 CRUD ──

function validateMyModelBody(body: any, forCreate: boolean, channelId: number): { values: any; error?: string } {
  const { model_id, display_name, logical_model_id, param_overrides, supports_chat, supports_image_gen, status, remark } = body || {}
  if (forCreate && !String(model_id || '').trim()) return { values: null, error: '渠道模型名（model_id）不能为空' }

  const isImage = supports_image_gen !== false // 默认生图模型
  const isChat = !!supports_chat
  if (forCreate && !isImage && !isChat) return { values: null, error: '模型必须至少支持生图或文字之一' }

  let logicalId: number | null = null
  if (isImage) {
    if (logical_model_id) {
      const lm = db.prepare(`SELECT * FROM ai_logical_models WHERE id = ? AND kind = 'image' AND status = 'active'`).get(logical_model_id) as any
      if (!lm) return { values: null, error: '逻辑模型不存在或不可用' }
      logicalId = lm.id
    }
  }

  let overridesJson: string | null = null
  if (param_overrides !== undefined && param_overrides !== null) {
    const err = validateCapabilityParams(param_overrides)
    if (err) return { values: null, error: `能力定义非法：${err}` }
    const overrides = param_overrides
    if (isImage && logicalId) {
      const lm = db.prepare(`SELECT default_params FROM ai_logical_models WHERE id = ?`).get(logicalId) as any
      const base = parseParams(lm.default_params)
      if (base) {
        const narrowErr = validateOverridesNarrowing(base, overrides)
        if (narrowErr) return { values: null, error: `能力覆盖只允许收窄：${narrowErr}` }
      }
    }
    if (isImage && !logicalId) {
      // 完全自定义：必须提供完整能力
      const err = validateCapabilityParams(param_overrides, { requireFull: true })
      if (err) return { values: null, error: `自定义能力不完整：${err}` }
    }
    overridesJson = JSON.stringify(param_overrides)
  } else if (forCreate && isImage && !logicalId) {
    return { values: null, error: '能力来源二选一：引用逻辑模型或完全自定义能力' }
  }

  if (status !== undefined && !['active', 'disabled'].includes(status)) {
    return { values: null, error: 'status 仅支持 active/disabled' }
  }

  return {
    values: {
      modelId: forCreate ? String(model_id).trim() : undefined,
      displayName: String(display_name || '').trim(),
      logicalId,
      overridesJson,
      supportsImageGen: isImage ? 1 : 0,
      supportsChat: isChat ? 1 : 0,
      supportsVision: isImage ? 1 : 0,
      status: status ?? (forCreate ? 'active' : undefined),
      remark: String(remark || ''),
    },
  }
}

myChannelsRouter.get('/channels/:id/models', (req: AuthRequest, res) => {
  const row = loadMyChannel(req.user!.userId, req.params.id)
  if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
  const models = db.prepare(`SELECT * FROM ai_models WHERE provider_id = ? ORDER BY id ASC`).all(row.id) as any[]
  res.json({ success: true, data: models.map(serializeModel) })
})

myChannelsRouter.post('/channels/:id/models', (req: AuthRequest, res) => {
  try {
    const row = loadMyChannel(req.user!.userId, req.params.id)
    if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
    const { values, error } = validateMyModelBody(req.body, true, row.id)
    if (error) { res.status(400).json({ success: false, error }); return }
    const dup = db.prepare(`SELECT id FROM ai_models WHERE provider_id = ? AND model_id = ?`).get(row.id, values.modelId)
    if (dup) { res.status(409).json({ success: false, error: '该渠道下已存在同名模型' }); return }
    const result = db.prepare(`
      INSERT INTO ai_models (provider_id, model_id, display_name, supports_vision, supports_image_gen, supports_chat, logical_model_id, param_overrides, pricing, remark, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(row.id, values.modelId, values.displayName, values.supportsVision, values.supportsImageGen, values.supportsChat, values.logicalId, values.overridesJson, values.remark, values.status)
    const created = db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(result.lastInsertRowid) as any
    res.json({ success: true, data: serializeModel(created) })
  } catch (err: any) {
    console.error('[my-channels] Create model error:', err.message)
    res.status(500).json({ success: false, error: '创建模型失败' })
  }
})

myChannelsRouter.patch('/channels/:id/models/:modelId', (req: AuthRequest, res) => {
  try {
    const row = loadMyChannel(req.user!.userId, req.params.id)
    if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
    const model = db.prepare(`SELECT * FROM ai_models WHERE id = ? AND provider_id = ?`).get(req.params.modelId, row.id) as any
    if (!model) { res.status(404).json({ success: false, error: '模型不存在' }); return }

    const body = { ...req.body }
    if (body.logical_model_id === undefined) body.logical_model_id = model.logical_model_id
    if (body.param_overrides === undefined) body.param_overrides = parseParams(model.param_overrides)
    if (body.supports_image_gen === undefined) body.supports_image_gen = !!model.supports_image_gen
    if (body.supports_chat === undefined) body.supports_chat = !!model.supports_chat
    const { values, error } = validateMyModelBody({ ...body, model_id: model.model_id }, false, row.id)
    if (error) { res.status(400).json({ success: false, error }); return }

    const fields: string[] = []
    const params: any[] = []
    if (body.display_name !== undefined) { fields.push('display_name = ?'); params.push(values.displayName) }
    if (body.logical_model_id !== undefined) { fields.push('logical_model_id = ?'); params.push(values.logicalId) }
    if (body.param_overrides !== undefined) { fields.push('param_overrides = ?'); params.push(values.overridesJson) }
    if (body.supports_image_gen !== undefined) { fields.push('supports_image_gen = ?'); params.push(values.supportsImageGen) }
    if (body.supports_chat !== undefined) { fields.push('supports_chat = ?'); params.push(values.supportsChat) }
    if (body.supports_vision !== undefined) { fields.push('supports_vision = ?'); params.push(values.supportsVision) }
    if (body.remark !== undefined) { fields.push('remark = ?'); params.push(values.remark) }
    if (body.status !== undefined) { fields.push('status = ?'); params.push(body.status) }
    if (fields.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }
    params.push(new Date().toISOString(), model.id)
    db.prepare(`UPDATE ai_models SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params)
    res.json({ success: true, data: serializeModel(db.prepare(`SELECT * FROM ai_models WHERE id = ?`).get(model.id) as any) })
  } catch (err: any) {
    console.error('[my-channels] Update model error:', err.message)
    res.status(500).json({ success: false, error: '更新模型失败' })
  }
})

myChannelsRouter.delete('/channels/:id/models/:modelId', (req: AuthRequest, res) => {
  const row = loadMyChannel(req.user!.userId, req.params.id)
  if (!row) { res.status(404).json({ success: false, error: '渠道不存在' }); return }
  const model = db.prepare(`SELECT id FROM ai_models WHERE id = ? AND provider_id = ?`).get(req.params.modelId, row.id) as any
  if (!model) { res.status(404).json({ success: false, error: '模型不存在' }); return }
  // 历史任务保留快照（generation_tasks.model 字符串 + provider_code），channel_model_id 软引用保留
  db.prepare(`DELETE FROM ai_models WHERE id = ?`).run(model.id)
  res.json({ success: true })
})

// ── 引用元数据：逻辑模型清单（引用模板用）+ 协议清单 ──

myChannelsRouter.get('/meta', (_req: AuthRequest, res) => {
  const logicalModels = db.prepare(`
    SELECT id, code, name, kind, default_params FROM ai_logical_models WHERE status = 'active' AND kind = 'image' ORDER BY id ASC
  `).all() as any[]
  res.json({
    success: true,
    data: {
      adapters: listAdapters().filter((a) => CHANNEL_ADAPTER_WHITELIST.includes(a.code)),
      logicalModels: logicalModels.map((m) => ({
        id: m.id, code: m.code, name: m.name,
        defaultParams: parseParams(m.default_params),
      })),
    },
  })
})
