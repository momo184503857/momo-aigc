import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { adminMiddleware } from '../middleware/admin.js'

// ────────────────────────────────────────────────────────────
//  AI 买家秀 · 素材库
//  公开路由（只读，任意登录用户） + 管理员路由（CRUD）
//  图片字节绝不经过服务器：浏览器直传 OSS，DB 只存 oss_* 字符串。
// ────────────────────────────────────────────────────────────

function listJoins(tagId?: number): { joins: string; params: any[] } {
  let joins = ''
  const params: any[] = []
  if (tagId) {
    joins += ` INNER JOIN buyer_show_material_tags mt ON m.id = mt.material_id AND mt.tag_id = ?`
    params.push(tagId)
  }
  return { joins, params }
}

// 给每个素材挂上 tags（在 handler 内 prepare，因 schema 在 seed() 后才初始化）
function attachTags(rows: any[]): any[] {
  const stmt = db.prepare(`
    SELECT t.id, t.name
    FROM buyer_show_tags t
    INNER JOIN buyer_show_material_tags mt ON t.id = mt.tag_id
    WHERE mt.material_id = ?
    ORDER BY t.name
  `)
  return rows.map((r: any) => ({ ...r, tags: stmt.all(r.id) }))
}

// 列表查询的通用分页/标签过滤
function listMaterials(opts: {
  tagId?: number
  page: number
  pageSize: number
  admin: boolean
}) {
  const { tagId, page, pageSize, admin } = opts
  const offset = (page - 1) * pageSize
  const { joins, params } = listJoins(tagId)

  const userJoin = admin ? ` LEFT JOIN users u ON m.created_by = u.id` : ''
  const fromSql = ` FROM buyer_show_materials m${joins}${userJoin} WHERE m.status = 'active'`

  const { total } = db.prepare(`SELECT COUNT(DISTINCT m.id) as total${fromSql}`).get(...params) as any

  const columns = admin
    ? `SELECT DISTINCT m.id, m.oss_bucket, m.oss_object_key, m.public_url, m.prompt, m.original_filename, m.mime_type, m.size_bytes, m.width, m.height, m.created_by, u.username, m.created_at`
    : `SELECT DISTINCT m.id, m.public_url, m.prompt, m.width, m.height, m.created_at`

  const records = db.prepare(
    `${columns}${fromSql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as any[]

  return { records: attachTags(records), total }
}

// ════════════ 公开路由（只读） ════════════
export const buyerShowRouter = Router()
buyerShowRouter.use(authMiddleware)

// GET /api/buyer-show/tags
buyerShowRouter.get('/tags', (_req, res) => {
  const tags = db.prepare(`
    SELECT t.id, t.name, COUNT(mt.material_id) as usage_count, t.created_at
    FROM buyer_show_tags t
    LEFT JOIN buyer_show_material_tags mt ON t.id = mt.tag_id
    LEFT JOIN buyer_show_materials m ON mt.material_id = m.id AND m.status = 'active'
    GROUP BY t.id
    ORDER BY usage_count DESC, t.name ASC
  `).all()
  res.json({ success: true, data: tags })
})

// GET /api/buyer-show
buyerShowRouter.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const tagId = req.query.tagId ? parseInt(req.query.tagId as string) : undefined
    const { records, total } = listMaterials({ tagId, page, pageSize, admin: false })
    res.json({
      success: true,
      data: { records, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (err: any) {
    console.error('[buyer-show] List error:', err.message)
    res.status(500).json({ success: false, error: '加载素材库失败: ' + err.message })
  }
})

// ════════════ 管理员路由（CRUD） ════════════
export const adminBuyerShowRouter = Router()
adminBuyerShowRouter.use(authMiddleware, adminMiddleware)

// GET /api/admin/buyer-show/tags
adminBuyerShowRouter.get('/tags', (_req, res) => {
  const tags = db.prepare(`
    SELECT t.id, t.name, COUNT(mt.material_id) as usage_count, t.created_at
    FROM buyer_show_tags t
    LEFT JOIN buyer_show_material_tags mt ON t.id = mt.tag_id
    LEFT JOIN buyer_show_materials m ON mt.material_id = m.id AND m.status = 'active'
    GROUP BY t.id
    ORDER BY usage_count DESC, t.name ASC
  `).all()
  res.json({ success: true, data: tags })
})

// POST /api/admin/buyer-show/tags  （幂等：同名返回已存在 id）
adminBuyerShowRouter.post('/tags', (req: AuthRequest, res) => {
  const { name } = req.body || {}
  if (!name || !String(name).trim()) {
    res.status(400).json({ success: false, error: '标签名不能为空' })
    return
  }
  const trimmed = String(name).trim()
  const existing = db.prepare('SELECT id FROM buyer_show_tags WHERE name = ?').get(trimmed) as any
  if (existing) {
    res.json({ success: true, data: { id: existing.id, name: trimmed } })
    return
  }
  const result = db.prepare('INSERT INTO buyer_show_tags (name) VALUES (?)').run(trimmed)
  res.json({ success: true, data: { id: result.lastInsertRowid, name: trimmed } })
})

// DELETE /api/admin/buyer-show/tags/:id （级联清理 join 行）
adminBuyerShowRouter.delete('/tags/:id', (req, res) => {
  db.prepare('DELETE FROM buyer_show_tags WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// GET /api/admin/buyer-show  （含管理员元数据）
adminBuyerShowRouter.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const tagId = req.query.tagId ? parseInt(req.query.tagId as string) : undefined
    const { records, total } = listMaterials({ tagId, page, pageSize, admin: true })
    res.json({
      success: true,
      data: { records, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (err: any) {
    console.error('[buyer-show] Admin list error:', err.message)
    res.status(500).json({ success: false, error: '加载素材库失败: ' + err.message })
  }
})

// POST /api/admin/buyer-show/batch  （单事务批量创建）
adminBuyerShowRouter.post('/batch', (req: AuthRequest, res) => {
  const { items } = req.body || {}
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: '缺少素材数据' })
    return
  }

  // 校验（oss_* 在直接传模式下为哨兵值，仅 public_url 必填）
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {}
    if (!it.public_url) {
      res.status(400).json({ success: false, error: `第 ${i + 1} 条缺少图片地址` })
      return
    }
    if (!it.prompt || !String(it.prompt).trim()) {
      res.status(400).json({ success: false, error: `第 ${i + 1} 条提示词不能为空` })
      return
    }
  }

  const insertMaterial = db.prepare(`
    INSERT INTO buyer_show_materials
      (oss_bucket, oss_object_key, public_url, prompt, original_filename, mime_type, size_bytes, width, height, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertJoin = db.prepare(
    'INSERT OR IGNORE INTO buyer_show_material_tags (material_id, tag_id) VALUES (?, ?)'
  )

  const tx = db.transaction(() => {
    const ids: number[] = []
    for (const it of items) {
      const r = insertMaterial.run(
        it.oss_bucket || '',
        it.oss_object_key || '',
        it.public_url,
        String(it.prompt).trim(),
        it.original_filename || null,
        it.mime_type || null,
        it.size_bytes || null,
        it.width || null,
        it.height || null,
        req.user!.userId
      )
      const id = Number(r.lastInsertRowid)
      if (Array.isArray(it.tagIds)) {
        for (const tagId of it.tagIds) insertJoin.run(id, tagId)
      }
      ids.push(id)
    }
    return ids
  })

  try {
    const ids = tx()
    res.json({ success: true, data: { ids } })
  } catch (err: any) {
    console.error('[buyer-show] batch create error:', err.message)
    res.status(500).json({ success: false, error: '保存失败: ' + err.message })
  }
})

// PATCH /api/admin/buyer-show/:id  （提示词 / 标签 / 替换图片）
adminBuyerShowRouter.patch('/:id', (req: AuthRequest, res) => {
  const id = req.params.id
  const existing = db.prepare(
    "SELECT id FROM buyer_show_materials WHERE id = ? AND status = 'active'"
  ).get(id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '素材不存在' })
    return
  }

  const { prompt, tagIds, image } = req.body || {}

  const fields: string[] = []
  const params: any[] = []

  if (prompt !== undefined) {
    if (!String(prompt).trim()) {
      res.status(400).json({ success: false, error: '提示词不能为空' })
      return
    }
    fields.push('prompt = ?')
    params.push(String(prompt).trim())
  }

  if (image && typeof image === 'object' && image.public_url) {
    fields.push('oss_bucket = ?', 'oss_object_key = ?', 'public_url = ?')
    params.push(image.oss_bucket || '', image.oss_object_key || '', image.public_url)
    if (image.original_filename !== undefined) { fields.push('original_filename = ?'); params.push(image.original_filename || null) }
    if (image.mime_type !== undefined) { fields.push('mime_type = ?'); params.push(image.mime_type || null) }
    if (image.size_bytes !== undefined) { fields.push('size_bytes = ?'); params.push(image.size_bytes || null) }
    if (image.width !== undefined) { fields.push('width = ?'); params.push(image.width || null) }
    if (image.height !== undefined) { fields.push('height = ?'); params.push(image.height || null) }
  }

  const doTags = Array.isArray(tagIds)

  if (fields.length === 0 && !doTags) {
    res.status(400).json({ success: false, error: '无更新字段' })
    return
  }

  const deleteTags = db.prepare('DELETE FROM buyer_show_material_tags WHERE material_id = ?')
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO buyer_show_material_tags (material_id, tag_id) VALUES (?, ?)'
  )

  const tx = db.transaction(() => {
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP')
      params.push(id)
      db.prepare(`UPDATE buyer_show_materials SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    }
    if (doTags) {
      deleteTags.run(id)
      for (const tagId of tagIds) insertTag.run(id, tagId)
    }
  })

  try {
    tx()
    res.json({ success: true })
  } catch (err: any) {
    console.error('[buyer-show] update error:', err.message)
    res.status(500).json({ success: false, error: '保存失败: ' + err.message })
  }
})

// DELETE /api/admin/buyer-show/batch  （单事务批量软删）
adminBuyerShowRouter.delete('/batch', (req, res) => {
  const { ids } = req.body || {}
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: '缺少 ids' })
    return
  }
  const placeholders = ids.map(() => '?').join(',')
  const result = db.prepare(
    `UPDATE buyer_show_materials SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`
  ).run(...ids)
  res.json({ success: true, data: { deleted: result.changes } })
})
