import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'

// ────────────────────────────────────────────────────────────
//  提示词参考案例库 · 管理员路由
//  CRUD 官方案例图：选字段 + 关键词 + 上传图 + 填 prompt
// ────────────────────────────────────────────────────────────

export const adminPromptCasesRouter = Router()
adminPromptCasesRouter.use(authMiddleware, adminMiddleware)

// GET /api/admin/prompt-cases  全部官方案例
adminPromptCasesRouter.get('/', (req, res) => {
  try {
    const segment = req.query.segment as string | undefined
    let sql = `SELECT * FROM prompt_cases`
    const params: any[] = []
    if (segment) {
      sql += ` WHERE segment_key = ?`
      params.push(segment)
    }
    sql += ` ORDER BY segment_key ASC, sort_order ASC, created_at ASC`
    const cases = db.prepare(sql).all(...params)
    res.json({ success: true, data: cases })
  } catch (err: any) {
    console.error('[admin/prompt-cases] List error:', err.message)
    res.status(500).json({ success: false, error: '加载案例失败' })
  }
})

// POST /api/admin/prompt-cases  新增案例
adminPromptCasesRouter.post('/', (req: AuthRequest, res) => {
  try {
    const { segment_key, keyword, image_url, prompt_snapshot, model, sort_order } = req.body || {}
    if (!segment_key || !keyword || !image_url) {
      res.status(400).json({ success: false, error: '字段、关键词、图片不能为空' })
      return
    }
    const result = db.prepare(`
      INSERT INTO prompt_cases (segment_key, keyword, image_url, prompt_snapshot, model, sort_order, is_official)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(segment_key, keyword.trim(), image_url, prompt_snapshot || '', model || '', sort_order || 0)
    res.json({ success: true, data: { id: result.lastInsertRowid } })
  } catch (err: any) {
    console.error('[admin/prompt-cases] Create error:', err.message)
    res.status(500).json({ success: false, error: '创建失败' })
  }
})

// PATCH /api/admin/prompt-cases/:id  编辑案例
adminPromptCasesRouter.patch('/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT id FROM prompt_cases WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ success: false, error: '案例不存在' })
      return
    }
    const { segment_key, keyword, image_url, prompt_snapshot, model, sort_order } = req.body || {}
    const fields: string[] = []
    const params: any[] = []
    if (segment_key !== undefined) { fields.push('segment_key = ?'); params.push(segment_key) }
    if (keyword !== undefined) { fields.push('keyword = ?'); params.push(keyword.trim()) }
    if (image_url !== undefined) { fields.push('image_url = ?'); params.push(image_url) }
    if (prompt_snapshot !== undefined) { fields.push('prompt_snapshot = ?'); params.push(prompt_snapshot) }
    if (model !== undefined) { fields.push('model = ?'); params.push(model) }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order) }
    if (fields.length === 0) {
      res.status(400).json({ success: false, error: '无更新字段' })
      return
    }
    params.push(id)
    db.prepare(`UPDATE prompt_cases SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[admin/prompt-cases] Update error:', err.message)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

// DELETE /api/admin/prompt-cases/:id  删除案例
adminPromptCasesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM prompt_cases WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})
