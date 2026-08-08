import { Router } from 'express'
import { db } from '../db/index.js'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const promptsRouter = Router()

// 提示词库为每个用户私有，所有端点都需登录校验
promptsRouter.use(authMiddleware)

interface PromptRow {
  id: string
  user_id: number
  name: string
  content: string
  tags: string
  sort_order: number
  is_starred: number
  created_at: string
  updated_at: string
}

function rowToItem(row: PromptRow) {
  let tags: string[] = []
  try { tags = JSON.parse(row.tags || '[]') } catch { /* */ }
  return { ...row, tags, is_starred: !!row.is_starred }
}

// List all prompts of the current user（收藏置顶）
promptsRouter.get('/', (req: AuthRequest, res) => {
  const rows = db.prepare(
    'SELECT * FROM prompt_library WHERE user_id = ? ORDER BY is_starred DESC, sort_order ASC, updated_at DESC'
  ).all(req.user!.userId) as PromptRow[]
  res.json({ success: true, data: rows.map(rowToItem) })
})

// Create
promptsRouter.post('/', (req: AuthRequest, res) => {
  const { name, content, tags } = req.body
  if (!name || !content) {
    res.status(400).json({ success: false, error: '名称和内容不能为空' })
    return
  }
  const id = uuidv4()
  const now = new Date().toISOString()
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM prompt_library WHERE user_id = ?').get(req.user!.userId) as any)?.m ?? -1

  db.prepare(
    'INSERT INTO prompt_library (id, user_id, name, content, tags, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user!.userId, name.trim(), content.trim(), JSON.stringify((tags || []).slice(0, 10)), maxOrder + 1, now, now)

  const row = db.prepare('SELECT * FROM prompt_library WHERE id = ?').get(id) as PromptRow
  res.json({ success: true, data: rowToItem(row) })
})

// Update
promptsRouter.patch('/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT * FROM prompt_library WHERE id = ? AND user_id = ?').get(id, req.user!.userId) as PromptRow | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: '提示词不存在' })
    return
  }
  const { name, content, tags } = req.body
  const now = new Date().toISOString()
  db.prepare(
    'UPDATE prompt_library SET name = ?, content = ?, tags = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).run(
    (name ?? existing.name).trim(),
    (content ?? existing.content).trim(),
    JSON.stringify((tags ?? JSON.parse(existing.tags || '[]')).slice(0, 10)),
    now,
    id,
    req.user!.userId
  )
  const row = db.prepare('SELECT * FROM prompt_library WHERE id = ?').get(id) as PromptRow
  res.json({ success: true, data: rowToItem(row) })
})

// Toggle favorite (收藏/取消收藏)
promptsRouter.patch('/:id/favorite', (req: AuthRequest, res) => {
  const { id } = req.params
  const { is_starred } = req.body
  const result = db.prepare(
    'UPDATE prompt_library SET is_starred = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(is_starred ? 1 : 0, id, req.user!.userId)
  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '提示词不存在' })
    return
  }
  res.json({ success: true })
})

// Delete
promptsRouter.delete('/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT id FROM prompt_library WHERE id = ? AND user_id = ?').get(id, req.user!.userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '提示词不存在' })
    return
  }
  db.prepare('DELETE FROM prompt_library WHERE id = ? AND user_id = ?').run(id, req.user!.userId)
  res.json({ success: true })
})
