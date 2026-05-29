import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const canvasRouter = Router()

canvasRouter.use(authMiddleware)

// ─── Project CRUD ───

// List projects
canvasRouter.get('/projects', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rows = db.prepare(
    `SELECT id, name, description, notes, thumbnail, node_count, created_at, updated_at
     FROM canvas_projects WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(userId)
  res.json({ success: true, data: rows })
})

// Get single project
canvasRouter.get('/projects/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const row = db.prepare(
    `SELECT * FROM canvas_projects WHERE id = ? AND user_id = ?`
  ).get(req.params.id, userId)
  if (!row) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  res.json({ success: true, data: row })
})

// Create project
canvasRouter.post('/projects', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { name, description, notes, thumbnail, workflowData } = req.body
  const now = new Date().toISOString()
  const result = db.prepare(
    `INSERT INTO canvas_projects (user_id, name, description, notes, thumbnail, workflow_data, node_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(userId, name || '未命名 AI 画布', description || '', notes || '', thumbnail || null, workflowData || '', now, now)
  const project = db.prepare(`SELECT * FROM canvas_projects WHERE id = ?`).get(result.lastInsertRowid)
  res.json({ success: true, data: project })
})

// Update project
canvasRouter.put('/projects/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { name, description, notes, thumbnail, workflowData, nodeCount } = req.body
  const existing = db.prepare(
    `SELECT id FROM canvas_projects WHERE id = ? AND user_id = ?`
  ).get(req.params.id, userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [now]
  if (name !== undefined) { sets.push('name = ?'); values.push(name) }
  if (description !== undefined) { sets.push('description = ?'); values.push(description) }
  if (notes !== undefined) { sets.push('notes = ?'); values.push(notes) }
  if (thumbnail !== undefined) { sets.push('thumbnail = ?'); values.push(thumbnail) }
  if (workflowData !== undefined) { sets.push('workflow_data = ?'); values.push(workflowData) }
  if (nodeCount !== undefined) { sets.push('node_count = ?'); values.push(nodeCount) }
  values.push(req.params.id, userId)
  db.prepare(
    `UPDATE canvas_projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...values)
  const updated = db.prepare(`SELECT * FROM canvas_projects WHERE id = ?`).get(req.params.id)
  res.json({ success: true, data: updated })
})

// Delete project
canvasRouter.delete('/projects/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  db.prepare(`DELETE FROM canvas_projects WHERE id = ? AND user_id = ?`).run(req.params.id, userId)
  db.prepare(`DELETE FROM canvas_assets WHERE project_id = ? AND user_id = ?`).run(req.params.id, userId)
  res.json({ success: true })
})

// Duplicate project
canvasRouter.post('/projects/:id/duplicate', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const original = db.prepare(
    `SELECT * FROM canvas_projects WHERE id = ? AND user_id = ?`
  ).get(req.params.id, userId) as any
  if (!original) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const now = new Date().toISOString()
  const result = db.prepare(
    `INSERT INTO canvas_projects (user_id, name, description, notes, thumbnail, workflow_data, node_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, `${original.name} (副本)`, original.description, original.notes, original.thumbnail, original.workflow_data, original.node_count, now, now)
  const project = db.prepare(`SELECT * FROM canvas_projects WHERE id = ?`).get(result.lastInsertRowid)
  res.json({ success: true, data: project })
})

// Import from JSON
canvasRouter.post('/projects/import', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { workflowJson } = req.body
  if (!workflowJson) {
    res.status(400).json({ success: false, error: '缺少 workflow JSON' })
    return
  }
  let name = '导入的画布'
  let nodeCount = 0
  try {
    const data = JSON.parse(workflowJson)
    name = data.name || name
    nodeCount = data.nodes?.length || 0
  } catch { /* ignore */ }
  const now = new Date().toISOString()
  const result = db.prepare(
    `INSERT INTO canvas_projects (user_id, name, workflow_data, node_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, name, workflowJson, nodeCount, now, now)
  const project = db.prepare(`SELECT * FROM canvas_projects WHERE id = ?`).get(result.lastInsertRowid)
  res.json({ success: true, data: project })
})

// ─── Asset CRUD ───

// List assets
canvasRouter.get('/assets', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 50
  const projectId = req.query.projectId as string | undefined

  const conditions = ['user_id = ?']
  const params: unknown[] = [userId]
  if (projectId) { conditions.push('project_id = ?'); params.push(projectId) }

  const where = conditions.join(' AND ')
  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM canvas_assets WHERE ${where}`).get(...params) as any).cnt
  const offset = (page - 1) * pageSize
  params.push(pageSize, offset)
  const rows = db.prepare(
    `SELECT * FROM canvas_assets WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params)
  res.json({ success: true, data: { assets: rows, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) } })
})

// Add asset
canvasRouter.post('/assets', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { id, fileName, filePath, previewUrl, size, nodeId, nodeTitle, projectId } = req.body
  const assetId = id || `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  db.prepare(
    `INSERT INTO canvas_assets (id, user_id, file_name, file_path, preview_url, size, node_id, node_title, project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(assetId, userId, fileName, filePath, previewUrl || '', size || 0, nodeId || '', nodeTitle || '', projectId || null, new Date().toISOString())
  res.json({ success: true, data: { id: assetId } })
})

// Delete asset
canvasRouter.delete('/assets/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  db.prepare(`DELETE FROM canvas_assets WHERE id = ? AND user_id = ?`).run(req.params.id, userId)
  res.json({ success: true })
})
