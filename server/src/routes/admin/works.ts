import { Router } from 'express'
import { db } from '../../db/index.js'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'

// ────────────────────────────────────────────────────────────
//  作品库 · 管理员路由
//  审核管理（上下架/删除） + 官方种子发布 + 标签管理
// ────────────────────────────────────────────────────────────

export const adminWorksRouter = Router()
adminWorksRouter.use(authMiddleware, adminMiddleware)

function safeParseJson(text: string | null | undefined, fallback: any): any {
  try {
    return JSON.parse(text || '{}') || fallback
  } catch {
    return fallback
  }
}

// GET /api/admin/works  全部作品列表（含 hidden）
adminWorksRouter.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const offset = (page - 1) * pageSize
    const status = req.query.status as string | undefined
    const keyword = (req.query.keyword as string | undefined)?.trim() || ''

    const params: any[] = []
    const conditions: string[] = []
    if (status) {
      conditions.push('w.status = ?')
      params.push(status)
    }
    if (keyword) {
      conditions.push('(w.prompt LIKE ?)')
      params.push(`%${keyword}%`)
    }
    const whereSql = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM works w ${whereSql}`).get(...params) as any
    const records = db.prepare(`
      SELECT w.*, u.username, u.nickname
      FROM works w
      LEFT JOIN users u ON w.user_id = u.id
      ${whereSql}
      ORDER BY w.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]

    const result = records.map((r: any) => ({
      ...r,
      prompt_segments: safeParseJson(r.prompt_segments, {}),
      reference_image_urls: safeParseJson(r.reference_image_urls, []),
      is_official: !!r.is_official,
    }))

    res.json({
      success: true,
      data: { records: result, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (err: any) {
    console.error('[admin/works] List error:', err.message)
    res.status(500).json({ success: false, error: '加载作品列表失败: ' + err.message })
  }
})

// PATCH /api/admin/works/:id/status  上架/下架
adminWorksRouter.patch('/:id/status', (req, res) => {
  const { id } = req.params
  const { status } = req.body || {}
  if (!['published', 'hidden'].includes(status)) {
    res.status(400).json({ success: false, error: '无效状态，仅支持 published/hidden' })
    return
  }
  const result = db.prepare('UPDATE works SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id)
  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '作品不存在' })
    return
  }
  res.json({ success: true })
})

// DELETE /api/admin/works/:id  强制删除任意作品
adminWorksRouter.delete('/:id', (req, res) => {
  const { id } = req.params
  db.prepare('DELETE FROM works WHERE id = ?').run(id)
  res.json({ success: true })
})

// POST /api/admin/works/official  发布官方种子作品
adminWorksRouter.post('/official', (req: AuthRequest, res) => {
  try {
    const {
      remark, image_url, prompt, user_prompt,
      prompt_segments, negative_prompt, model, resolution, aspect_ratio,
      feature_id, reference_image_urls, tagIds,
    } = req.body || {}

    if (!image_url || !prompt || !model) {
      res.status(400).json({ success: false, error: '图片、提示词、模型不能为空' })
      return
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    const insertWork = db.prepare(`
      INSERT INTO works
        (id, user_id, title, description, remark, image_url, thumb_url, prompt, user_prompt,
         prompt_segments, negative_prompt, model, resolution, aspect_ratio, feature_id,
         reference_image_urls, source_task_id, status, is_official, created_at, updated_at)
      VALUES (?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'published', 1, ?, ?)
    `)
    const insertTagRelation = db.prepare('INSERT OR IGNORE INTO work_tag_relations (work_id, tag_id) VALUES (?, ?)')

    const tx = db.transaction(() => {
      insertWork.run(
        id, req.user!.userId, remark ? String(remark).trim().slice(0, 500) : '',
        image_url, image_url,
        prompt, user_prompt || '',
        JSON.stringify(prompt_segments || {}), negative_prompt || '',
        model, resolution || null, aspect_ratio || null, feature_id || null,
        JSON.stringify(reference_image_urls || []), now, now
      )
      if (Array.isArray(tagIds)) {
        for (const tid of tagIds) insertTagRelation.run(id, tid)
      }
    })
    tx()

    const row = db.prepare('SELECT * FROM works WHERE id = ?').get(id) as any
    res.json({
      success: true,
      data: {
        ...row,
        prompt_segments: safeParseJson(row.prompt_segments, {}),
        reference_image_urls: safeParseJson(row.reference_image_urls, []),
        is_official: true,
      },
    })
  } catch (err: any) {
    console.error('[admin/works] Official publish error:', err.message)
    res.status(500).json({ success: false, error: '发布失败: ' + err.message })
  }
})

// GET /api/admin/works/tags  标签列表
adminWorksRouter.get('/tags', (_req, res) => {
  const tags = db.prepare(`
    SELECT t.id, t.name, COUNT(r.work_id) as usage_count, t.created_at
    FROM work_tags t
    LEFT JOIN work_tag_relations r ON t.id = r.tag_id
    GROUP BY t.id
    ORDER BY usage_count DESC, t.name ASC
  `).all()
  res.json({ success: true, data: tags })
})

// POST /api/admin/works/tags  新建标签（幂等：同名返回已存在 id）
adminWorksRouter.post('/tags', (req, res) => {
  const { name } = req.body || {}
  if (!name || !String(name).trim()) {
    res.status(400).json({ success: false, error: '标签名不能为空' })
    return
  }
  const trimmed = String(name).trim()
  const existing = db.prepare('SELECT id FROM work_tags WHERE name = ?').get(trimmed) as any
  if (existing) {
    res.json({ success: true, data: { id: existing.id, name: trimmed } })
    return
  }
  const result = db.prepare('INSERT INTO work_tags (name) VALUES (?)').run(trimmed)
  res.json({ success: true, data: { id: result.lastInsertRowid, name: trimmed } })
})

// DELETE /api/admin/works/tags/:id  删除标签（级联清理 join 行）
adminWorksRouter.delete('/tags/:id', (req, res) => {
  db.prepare('DELETE FROM work_tags WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})
