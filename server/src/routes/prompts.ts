import { Router } from 'express'
import { db } from '../db/index.js'
import { v4 as uuidv4 } from 'uuid'

export const promptsRouter = Router()

interface PromptRow {
  id: string
  name: string
  content: string
  tags: string
  sort_order: number
  created_at: string
  updated_at: string
}

function rowToItem(row: PromptRow) {
  let tags: string[] = []
  try { tags = JSON.parse(row.tags || '[]') } catch { /* */ }
  return { ...row, tags }
}

// List all prompts
promptsRouter.get('/', (_req, res) => {
  const rows = db.prepare(
    'SELECT * FROM prompt_library ORDER BY sort_order ASC, updated_at DESC'
  ).all() as PromptRow[]
  res.json({ success: true, data: rows.map(rowToItem) })
})

// Create
promptsRouter.post('/', (req, res) => {
  const { name, content, tags } = req.body
  if (!name || !content) {
    res.status(400).json({ success: false, error: '名称和内容不能为空' })
    return
  }
  const id = uuidv4()
  const now = new Date().toISOString()
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM prompt_library').get() as any)?.m ?? -1

  db.prepare(
    'INSERT INTO prompt_library (id, name, content, tags, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name.trim(), content.trim(), JSON.stringify((tags || []).slice(0, 10)), maxOrder + 1, now, now)

  const row = db.prepare('SELECT * FROM prompt_library WHERE id = ?').get(id) as PromptRow
  res.json({ success: true, data: rowToItem(row) })
})

// Update
promptsRouter.patch('/:id', (req, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT * FROM prompt_library WHERE id = ?').get(id) as PromptRow | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: '提示词不存在' })
    return
  }
  const { name, content, tags } = req.body
  const now = new Date().toISOString()
  db.prepare(
    'UPDATE prompt_library SET name = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?'
  ).run(
    (name ?? existing.name).trim(),
    (content ?? existing.content).trim(),
    JSON.stringify((tags ?? JSON.parse(existing.tags || '[]')).slice(0, 10)),
    now,
    id
  )
  const row = db.prepare('SELECT * FROM prompt_library WHERE id = ?').get(id) as PromptRow
  res.json({ success: true, data: rowToItem(row) })
})

// Delete
promptsRouter.delete('/:id', (req, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT id FROM prompt_library WHERE id = ?').get(id)
  if (!existing) {
    res.status(404).json({ success: false, error: '提示词不存在' })
    return
  }
  db.prepare('DELETE FROM prompt_library WHERE id = ?').run(id)
  res.json({ success: true })
})
