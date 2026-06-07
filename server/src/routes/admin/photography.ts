import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'

export const adminPhotographyRouter = Router()

adminPhotographyRouter.use(authMiddleware, adminMiddleware)

// ─── Elements CRUD ───

// GET /api/admin/photography/elements — list all elements
adminPhotographyRouter.get('/elements', (_req: AuthRequest, res) => {
  const elements = db.prepare(
    'SELECT * FROM photography_elements ORDER BY sort_order ASC'
  ).all()
  res.json({ success: true, data: elements })
})

// POST /api/admin/photography/elements — create element
adminPhotographyRouter.post('/elements', (req: AuthRequest, res) => {
  const { name, label, max_images, sort_order } = req.body
  if (!name || !label) {
    res.status(400).json({ success: false, error: '名称和标签不能为空' })
    return
  }
  const max = Math.max(1, Math.min(10, max_images || 1))
  const result = db.prepare(
    'INSERT INTO photography_elements (name, label, max_images, sort_order) VALUES (?, ?, ?, ?)'
  ).run(name, label, max, sort_order || 0)

  // Seed element prompts for all models
  const modelIds = db.prepare(
    "SELECT DISTINCT model_id FROM photography_element_prompts"
  ).all() as { model_id: string }[]
  const insertPrompt = db.prepare(
    'INSERT OR IGNORE INTO photography_element_prompts (element_id, model_id) VALUES (?, ?)'
  )
  const elementId = result.lastInsertRowid as number
  const models = modelIds.length > 0 ? modelIds : [
    { model_id: 'gpt-image-2' },
    { model_id: 'gemini-3-pro-image-preview' },
    { model_id: 'gemini-3.1-flash-image-preview' },
    { model_id: 'gemini-2.5-flash-image-preview' },
  ]
  for (const { model_id } of models) {
    insertPrompt.run(elementId, model_id)
  }

  const created = db.prepare('SELECT * FROM photography_elements WHERE id = ?').get(elementId)
  res.json({ success: true, data: created })
})

// PUT /api/admin/photography/elements/:id — update element
adminPhotographyRouter.put('/elements/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const { name, label, max_images, sort_order, status } = req.body

  const existing = db.prepare('SELECT * FROM photography_elements WHERE id = ?').get(id)
  if (!existing) {
    res.status(404).json({ success: false, error: '元素不存在' })
    return
  }

  const fields: string[] = []
  const params: any[] = []

  if (name !== undefined) { fields.push('name = ?'); params.push(name) }
  if (label !== undefined) { fields.push('label = ?'); params.push(label) }
  if (max_images !== undefined) {
    fields.push('max_images = ?')
    params.push(Math.max(1, Math.min(10, max_images)))
  }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order) }
  if (status !== undefined) { fields.push('status = ?'); params.push(status) }

  if (fields.length === 0) {
    res.status(400).json({ success: false, error: '无更新字段' })
    return
  }

  fields.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  db.prepare(`UPDATE photography_elements SET ${fields.join(', ')} WHERE id = ?`).run(...params)

  const updated = db.prepare('SELECT * FROM photography_elements WHERE id = ?').get(id)
  res.json({ success: true, data: updated })
})

// DELETE /api/admin/photography/elements/:id — delete element
adminPhotographyRouter.delete('/elements/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT * FROM photography_elements WHERE id = ?').get(id)
  if (!existing) {
    res.status(404).json({ success: false, error: '元素不存在' })
    return
  }
  db.prepare('DELETE FROM photography_element_prompts WHERE element_id = ?').run(id)
  db.prepare('DELETE FROM photography_elements WHERE id = ?').run(id)
  res.json({ success: true })
})

// ─── Element Prompts ───

// GET /api/admin/photography/element-prompts — list all prompts
adminPhotographyRouter.get('/element-prompts', (_req: AuthRequest, res) => {
  const rows = db.prepare(
    `SELECT pep.*, e.name as element_name, e.label as element_label
     FROM photography_element_prompts pep
     JOIN photography_elements e ON e.id = pep.element_id
     ORDER BY e.sort_order ASC, pep.model_id ASC`
  ).all()
  res.json({ success: true, data: rows })
})

// PATCH /api/admin/photography/element-prompts/:id — update single prompt
adminPhotographyRouter.patch('/element-prompts/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const { system_prompt } = req.body

  const existing = db.prepare('SELECT * FROM photography_element_prompts WHERE id = ?').get(id)
  if (!existing) {
    res.status(404).json({ success: false, error: '记录不存在' })
    return
  }

  db.prepare(
    'UPDATE photography_element_prompts SET system_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(system_prompt ?? '', id)

  const updated = db.prepare(
    `SELECT pep.*, e.name as element_name, e.label as element_label
     FROM photography_element_prompts pep
     JOIN photography_elements e ON e.id = pep.element_id
     WHERE pep.id = ?`
  ).get(id)
  res.json({ success: true, data: updated })
})
