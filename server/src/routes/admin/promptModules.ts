import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'

// ────────────────────────────────────────────────────────────
//  提示词工坊 · 模块管理（管理员）
//
//  模块类型：requirement（要求）/ element（元素）/ forbidden（禁止出现）。
//  「要求」「禁止出现」为系统内置（is_system=1），不可改名、不可删除；
//  管理员在此基础上自由增删「元素」模块（风格/场景/光影/构图/画质等）。
// ────────────────────────────────────────────────────────────

export const adminPromptModulesRouter = Router()
adminPromptModulesRouter.use(authMiddleware, adminMiddleware)

// GET /api/admin/prompt-modules  全部模块（按 sort_order）
adminPromptModulesRouter.get('/', (_req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM prompt_modules ORDER BY sort_order ASC, id ASC`).all()
    res.json({
      success: true,
      data: rows.map((r: any) => ({ ...r, is_system: !!r.is_system })),
    })
  } catch (err: any) {
    console.error('[admin/prompt-modules] List error:', err.message)
    res.status(500).json({ success: false, error: '加载模块失败' })
  }
})

// POST /api/admin/prompt-modules  新增元素模块
adminPromptModulesRouter.post('/', (req: AuthRequest, res) => {
  try {
    const { name, sort_order } = req.body || {}
    const trimmed = String(name || '').trim()
    if (!trimmed) {
      res.status(400).json({ success: false, error: '模块名不能为空' })
      return
    }
    if (trimmed.length > 100) {
      res.status(400).json({ success: false, error: '模块名过长（最多 100 字）' })
      return
    }
    // 重名校验
    const dup = db.prepare(`SELECT id FROM prompt_modules WHERE name = ?`).get(trimmed)
    if (dup) {
      res.status(409).json({ success: false, error: '模块名已存在' })
      return
    }
    const result = db.prepare(`
      INSERT INTO prompt_modules (name, type, sort_order, is_system) VALUES (?, 'element', ?, 0)
    `).run(trimmed, Number.isFinite(sort_order) ? sort_order : 0)
    const row = db.prepare(`SELECT * FROM prompt_modules WHERE id = ?`).get(result.lastInsertRowid) as any
    res.json({ success: true, data: { ...row, is_system: !!row.is_system } })
  } catch (err: any) {
    console.error('[admin/prompt-modules] Create error:', err.message)
    res.status(500).json({ success: false, error: '创建失败' })
  }
})

// PATCH /api/admin/prompt-modules/:id  编辑模块名/排序（系统内置模块禁改）
adminPromptModulesRouter.patch('/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT * FROM prompt_modules WHERE id = ?`).get(id) as any
    if (!row) {
      res.status(404).json({ success: false, error: '模块不存在' })
      return
    }
    if (row.is_system) {
      res.status(400).json({ success: false, error: '系统内置模块不可修改' })
      return
    }
    const { name, sort_order } = req.body || {}
    const fields: string[] = []
    const params: any[] = []
    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) {
        res.status(400).json({ success: false, error: '模块名不能为空' })
        return
      }
      const dup = db.prepare(`SELECT id FROM prompt_modules WHERE name = ? AND id != ?`).get(trimmed, id)
      if (dup) {
        res.status(409).json({ success: false, error: '模块名已存在' })
        return
      }
      fields.push('name = ?'); params.push(trimmed)
    }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0) }
    if (fields.length === 0) {
      res.status(400).json({ success: false, error: '无更新字段' })
      return
    }
    params.push(new Date().toISOString(), id)
    db.prepare(`UPDATE prompt_modules SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params)
    const updated = db.prepare(`SELECT * FROM prompt_modules WHERE id = ?`).get(id) as any
    res.json({ success: true, data: { ...updated, is_system: !!updated.is_system } })
  } catch (err: any) {
    console.error('[admin/prompt-modules] Update error:', err.message)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

// DELETE /api/admin/prompt-modules/:id  删除元素模块（系统内置模块拒绝删除）
adminPromptModulesRouter.delete('/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const row = db.prepare(`SELECT * FROM prompt_modules WHERE id = ?`).get(id) as any
    if (!row) {
      res.status(404).json({ success: false, error: '模块不存在' })
      return
    }
    if (row.is_system) {
      res.status(400).json({ success: false, error: '系统内置模块不可删除' })
      return
    }
    // 引用此模块的卡片：module_id ON DELETE SET NULL，保留卡片（前端回退显示「已删除模块」）
    db.prepare(`DELETE FROM prompt_modules WHERE id = ?`).run(id)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[admin/prompt-modules] Delete error:', err.message)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})
