/**
 * suite-gen 资产通用 CRUD 工厂。
 *
 * 六类资产（themes/tracks/personas/lock-templates/garment-features/knowledge）
 * 共用一套路由实现；新增资产类型只需在 ASSET_TYPES 增加一行配置。
 *
 * 双轨权限：owner_user_id NULL = 全局（仅管理员可写，全员可读）；
 * owner_user_id = X = 私有（仅本人可读写）。用户对全局资产只能"复制为我的"。
 */
import { Router, Response } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { adminMiddleware } from '../middleware/admin.js'
import { v4 as uuidv4 } from 'uuid'
import { sanitizePointDetails, derivePointsFromDetails } from '../db/themeMeta.js'

interface AssetTypeConfig {
  table: string
  /** 允许经 API 读写的列（白名单） */
  fields: string[]
  /** 创建时必填列 */
  required: string[]
  /** 以 JSON 存储的列 */
  jsonFields: string[]
  /** 数字列 */
  numberFields: string[]
  orderBy: string
  /** 列表关键词搜索的列 */
  searchFields: string[]
  /** 列表业务过滤列（等值匹配） */
  filterFields: string[]
  /** 列表业务过滤列（JSON 数组包含匹配；'[]' 视为不限，如主题季节=全季） */
  jsonContainsFilters?: string[]
}

const ASSET_TYPES: Record<string, AssetTypeConfig> = {
  themes: {
    table: 'sg_themes',
    fields: ['name', 'track_key', 'season', 'styles', 'images', 'level', 'path', 'points', 'point_details', 'status', 'sort_order'],
    required: ['name'],
    jsonFields: ['points', 'point_details', 'season', 'styles', 'images'],
    numberFields: ['sort_order'],
    orderBy: 'ORDER BY sort_order ASC, id ASC',
    searchFields: ['name', 'path'],
    filterFields: ['track_key', 'status'],
    jsonContainsFilters: ['season'],
  },
  tracks: {
    table: 'sg_tracks',
    fields: ['key', 'name', 'emoji', 'mood', 'hair', 'light', 'acc', 'hand', 'status', 'sort_order'],
    required: ['key', 'name'],
    jsonFields: [],
    numberFields: ['sort_order'],
    orderBy: 'ORDER BY sort_order ASC, id ASC',
    searchFields: ['name', 'key'],
    filterFields: ['status'],
  },
  personas: {
    table: 'sg_personas',
    fields: ['name', 'avatar_url', 'dna', 'hair_default', 'fingerprint', 'note', 'status'],
    required: ['name'],
    jsonFields: ['fingerprint'],
    numberFields: [],
    orderBy: 'ORDER BY id ASC',
    searchFields: ['name'],
    filterFields: ['status'],
  },
  'lock-templates': {
    table: 'sg_lock_templates',
    fields: ['key', 'name', 'grp', 'order_no', 'content', 'cond_kind', 'models', 'scope', 'status'],
    required: ['key', 'name', 'grp', 'content'],
    jsonFields: ['models', 'scope'],
    numberFields: ['order_no'],
    orderBy: 'ORDER BY grp ASC, order_no ASC, id ASC',
    searchFields: ['name', 'key', 'content'],
    filterFields: ['grp', 'status'],
  },
  'garment-features': {
    table: 'sg_garment_features',
    fields: ['grp', 'name', 'match_tags', 'detail_hint', 'status', 'sort_order'],
    required: ['grp', 'name'],
    jsonFields: ['match_tags'],
    numberFields: ['sort_order'],
    orderBy: 'ORDER BY sort_order ASC, id ASC',
    searchFields: ['name'],
    filterFields: ['grp', 'status'],
  },
  knowledge: {
    table: 'sg_knowledge',
    fields: ['kind', 'field', 'content', 'status'],
    required: ['kind', 'field', 'content'],
    jsonFields: [],
    numberFields: [],
    orderBy: 'ORDER BY id ASC',
    searchFields: ['field'],
    filterFields: ['kind', 'field', 'status'],
  },
}

function parseAssetRow(cfg: AssetTypeConfig, row: any): any {
  if (!row) return row
  const parsed = { ...row }
  for (const f of cfg.jsonFields) {
    if (typeof parsed[f] === 'string') {
      try { parsed[f] = JSON.parse(parsed[f]) } catch { /* keep as-is */ }
    }
  }
  parsed.isGlobal = parsed.owner_user_id === null || parsed.owner_user_id === undefined
  delete parsed.owner_user_id
  return parsed
}

/** 校验并规整写入值；返回 [columns, values] */
function buildWriteValues(cfg: AssetTypeConfig, body: any): { cols: string[]; vals: any[] } {
  const cols: string[] = []
  const vals: any[] = []
  for (const f of cfg.fields) {
    if (body[f] === undefined) continue
    let v = body[f]
    if (cfg.jsonFields.includes(f)) {
      if (cfg.table === 'sg_themes' && f === 'point_details') {
        // 点位三字段为数据源：清洗后同步派生 points，保持旧点位描述一致
        const details = sanitizePointDetails(v)
        v = JSON.stringify(details)
        const derived = JSON.stringify(derivePointsFromDetails(details))
        const pi = cols.indexOf('points')
        if (pi >= 0) vals[pi] = derived
        else { cols.push('points'); vals.push(derived) }
      } else {
        v = JSON.stringify(v ?? [])
      }
    } else if (cfg.numberFields.includes(f)) {
      v = Number(v) || 0
    } else if (typeof v !== 'number') {
      v = String(v ?? '')
    }
    cols.push(f)
    vals.push(v)
  }
  return { cols, vals }
}

function requireAssetType(res: Response, type: string | string[]): AssetTypeConfig | null {
  type = Array.isArray(type) ? type[0] : type
  const cfg = ASSET_TYPES[type]
  if (!cfg) {
    res.status(404).json({ success: false, error: `未知资产类型：${type}` })
    return null
  }
  return cfg
}

function idNum(v: string | string[]): number {
  return parseInt(Array.isArray(v) ? v[0] : v)
}

function getRow(cfg: AssetTypeConfig, id: number): any {
  return db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id)
}

/** 越权守卫：私有行仅本人；全局行仅管理员可写 */
function canWrite(req: AuthRequest, row: any): boolean {
  if (row.owner_user_id === null) return req.user!.role === 'admin'
  return row.owner_user_id === req.user!.userId
}

function createAssetRouter(opts: { forceAdmin: boolean }): Router {
  const router = Router()
  router.use(authMiddleware)
  if (opts.forceAdmin) router.use(adminMiddleware)

  // 列表：scope=global|mine|all（默认 all = 全局 + 我的）
  router.get('/:type', (req: AuthRequest, res) => {
    const cfg = requireAssetType(res, req.params.type)
    if (!cfg) return
    try {
      const scope = (req.query.scope as string) || 'all'
      const keyword = ((req.query.keyword as string) || '').trim()
      const page = Math.max(1, parseInt(req.query.page as string) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50))

      const conditions: string[] = []
      const params: any[] = []
      if (opts.forceAdmin && scope === 'all') {
        // 管理后台总览：不过滤归属
      } else if (scope === 'global') {
        conditions.push('owner_user_id IS NULL')
      } else if (scope === 'mine') {
        conditions.push('owner_user_id = ?')
        params.push(req.user!.userId)
      } else {
        conditions.push('(owner_user_id IS NULL OR owner_user_id = ?)')
        params.push(req.user!.userId)
      }
      for (const f of cfg.filterFields) {
        const v = req.query[f]
        if (v !== undefined && v !== '') {
          conditions.push(`${f} = ?`)
          params.push(String(v))
        }
      }
      for (const f of cfg.jsonContainsFilters || []) {
        const v = req.query[f]
        if (v !== undefined && v !== '') {
          // JSON 数组元素包含匹配（如 season LIKE '%"春"%'）；'[]' 表示不限
          conditions.push(`(${f} = '[]' OR ${f} LIKE ?)`)
          params.push(`%"${String(v)}"%`)
        }
      }
      if (keyword && cfg.searchFields.length > 0) {
        conditions.push(`(${cfg.searchFields.map((f) => `${f} LIKE ?`).join(' OR ')})`)
        for (const _ of cfg.searchFields) params.push(`%${keyword}%`)
      }
      // 普通用户看不到已停用资产；管理员后台可按 status 过滤查看全部
      if (!opts.forceAdmin) conditions.push(`status = 'active'`)

      const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const countRow = db.prepare(`SELECT COUNT(*) as total FROM ${cfg.table} ${whereSql}`).get(...params) as any
      const rows = db.prepare(
        `SELECT * FROM ${cfg.table} ${whereSql} ${cfg.orderBy} LIMIT ? OFFSET ?`
      ).all(...params, pageSize, (page - 1) * pageSize)

      res.json({
        success: true,
        data: {
          records: (rows as any[]).map((r) => parseAssetRow(cfg, r)),
          total: countRow.total, page, pageSize,
        },
      })
    } catch (err: any) {
      console.error('[sg-assets] list error:', err.message)
      res.status(500).json({ success: false, error: '加载资产失败' })
    }
  })

  // 新建：默认私有；?global=true 且管理员 → 全局行
  router.post('/:type', (req: AuthRequest, res) => {
    const cfg = requireAssetType(res, req.params.type)
    if (!cfg) return
    try {
      const wantGlobal = req.query.global === 'true' || req.body?.isGlobal === true
      if (wantGlobal && req.user!.role !== 'admin') {
        res.status(403).json({ success: false, error: '仅管理员可创建全局资产' })
        return
      }
      const { cols, vals } = buildWriteValues(cfg, req.body || {})
      const missing = cfg.required.filter((f) => {
        const idx = cols.indexOf(f)
        return idx < 0 || vals[idx] === '' || vals[idx] === null
      })
      if (missing.length) {
        res.status(400).json({ success: false, error: `缺少必填字段：${missing.join('、')}` })
        return
      }
      const allCols = [...cols, 'owner_user_id', 'source']
      const allVals = [...vals, wantGlobal ? null : req.user!.userId, wantGlobal ? 'admin' : 'user']
      const placeholders = allCols.map(() => '?').join(', ')
      const result = db.prepare(
        `INSERT INTO ${cfg.table} (${allCols.join(', ')}) VALUES (${placeholders})`
      ).run(...allVals)
      const row = getRow(cfg, Number(result.lastInsertRowid))
      res.json({ success: true, data: parseAssetRow(cfg, row) })
    } catch (err: any) {
      console.error('[sg-assets] create error:', err.message)
      res.status(500).json({ success: false, error: '创建资产失败' })
    }
  })

  // 更新：私有行本人改；全局行仅管理员
  router.patch('/:type/:id', (req: AuthRequest, res) => {
    const cfg = requireAssetType(res, req.params.type)
    if (!cfg) return
    try {
      const row = getRow(cfg, idNum(req.params.id))
      if (!row) { res.status(404).json({ success: false, error: '资产不存在' }); return }
      if (!canWrite(req, row)) { res.status(403).json({ success: false, error: '无权修改该资产' }); return }
      const { cols, vals } = buildWriteValues(cfg, req.body || {})
      if (cols.length === 0) { res.status(400).json({ success: false, error: '无更新字段' }); return }
      db.prepare(
        `UPDATE ${cfg.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(...vals, row.id)
      res.json({ success: true, data: parseAssetRow(cfg, getRow(cfg, row.id)) })
    } catch (err: any) {
      console.error('[sg-assets] update error:', err.message)
      res.status(500).json({ success: false, error: '更新资产失败' })
    }
  })

  // 删除：私有行本人删；全局行仅管理员（种子资产禁物理删除，只能停用）
  router.delete('/:type/:id', (req: AuthRequest, res) => {
    const cfg = requireAssetType(res, req.params.type)
    if (!cfg) return
    try {
      const row = getRow(cfg, idNum(req.params.id))
      if (!row) { res.status(404).json({ success: false, error: '资产不存在' }); return }
      if (!canWrite(req, row)) { res.status(403).json({ success: false, error: '无权删除该资产' }); return }
      if (row.owner_user_id === null && row.source === 'seed') {
        res.status(400).json({ success: false, error: '种子资产不可删除，可将其停用' })
        return
      }
      db.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).run(row.id)
      res.json({ success: true, data: { id: row.id } })
    } catch (err: any) {
      console.error('[sg-assets] delete error:', err.message)
      res.status(500).json({ success: false, error: '删除资产失败' })
    }
  })

  // 复制为我的：全局 → 私有副本
  router.post('/:type/:id/copy', (req: AuthRequest, res) => {
    const cfg = requireAssetType(res, req.params.type)
    if (!cfg) return
    try {
      const row = getRow(cfg, idNum(req.params.id))
      if (!row) { res.status(404).json({ success: false, error: '资产不存在' }); return }
      if (row.owner_user_id !== null) {
        res.status(400).json({ success: false, error: '仅全局资产可复制为我的' })
        return
      }
      const cols = [...cfg.fields, 'owner_user_id', 'source']
      const vals = [...cfg.fields.map((f) => row[f]), req.user!.userId, 'copy']
      if (cfg.fields.includes('name')) {
        const nameIdx = cfg.fields.indexOf('name')
        vals[nameIdx] = `${row.name}（我的副本）`
      }
      const result = db.prepare(
        `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      ).run(...vals)
      res.json({ success: true, data: parseAssetRow(cfg, getRow(cfg, Number(result.lastInsertRowid))) })
    } catch (err: any) {
      console.error('[sg-assets] copy error:', err.message)
      res.status(500).json({ success: false, error: '复制资产失败' })
    }
  })

  // 使用计数 +1（套系提交时批量上报热度）
  router.post('/:type/:id/use', (req: AuthRequest, res) => {
    const cfg = requireAssetType(res, req.params.type)
    if (!cfg) return
    try {
      db.prepare(`UPDATE ${cfg.table} SET use_count = use_count + 1 WHERE id = ?`)
        .run(idNum(req.params.id))
      res.json({ success: true })
    } catch (err: any) {
      res.status(500).json({ success: false, error: '上报使用计数失败' })
    }
  })

  return router
}

// 用户端：/api/sg/assets
export const sgAssetsRouter = createAssetRouter({ forceAdmin: false })
// 管理端：/api/admin/sg（强制 admin，可管理全局行 + 查看全部）
export const adminSgAssetsRouter = createAssetRouter({ forceAdmin: true })

// 管理端附加：锁定模板一键发布为官方提示词卡片
export const sgAdminExtraRouter = Router()
sgAdminExtraRouter.use(authMiddleware, adminMiddleware)
sgAdminExtraRouter.post('/lock-templates/:id/publish-card', (req: AuthRequest, res) => {
  try {
    const row = db.prepare(`SELECT * FROM sg_lock_templates WHERE id = ?`).get(req.params.id) as any
    if (!row) { res.status(404).json({ success: false, error: '模板不存在' }); return }
    const modRow = db.prepare(`SELECT id FROM prompt_modules WHERE type = 'element' ORDER BY sort_order ASC LIMIT 1`).get() as any
    const cardId = uuidv4()
    db.prepare(`
      INSERT INTO prompt_cards (id, user_id, module_id, content, images, remark, is_official)
      VALUES (?, ?, ?, ?, '[]', ?, 1)
    `).run(cardId, req.user!.userId, modRow?.id ?? null, row.content, `官方锁定模板：${row.name}`)
    res.json({ success: true, data: { cardId } })
  } catch (err: any) {
    console.error('[sg-assets] publish-card error:', err.message)
    res.status(500).json({ success: false, error: '发布卡片失败' })
  }
})
