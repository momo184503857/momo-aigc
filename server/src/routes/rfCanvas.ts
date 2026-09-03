import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

/**
 * AI画布 Pro+（React Flow 版）项目 CRUD。
 *
 * graph_json 只做透传存储：API 层收发均为 graph 对象，落库 stringify、读取 parse
 * （坏 JSON → 空图 {}，不 500）。与旧画布（canvas_projects）/ Pro（nr_canvas_projects）
 * 数据完全隔离；资源不存在或非本人项目一律 404（不泄露存在性）。
 */

interface RfProjectRow {
  id: number
  user_id: number
  name: string
  graph_json: string
  node_count: number
  created_at: string
  updated_at: string
}

const rowToListItem = (row: RfProjectRow) => ({
  id: row.id,
  name: row.name,
  nodeCount: row.node_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const rowToDetail = (row: RfProjectRow) => ({
  id: row.id,
  name: row.name,
  graph: safeParseGraph(row.graph_json),
  nodeCount: row.node_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

function safeParseGraph(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const NAME_MAX = 50

function validName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= NAME_MAX
}

export const rfCanvasRouter = Router()

rfCanvasRouter.use(authMiddleware)

// List projects (without graph)
rfCanvasRouter.get('/projects', (req: AuthRequest, res) => {
  const rows = db.prepare(
    `SELECT id, user_id, name, graph_json, node_count, created_at, updated_at
     FROM rf_canvas_projects WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(req.user!.userId) as RfProjectRow[]
  res.json({ success: true, data: rows.map(rowToListItem) })
})

// Get single project
rfCanvasRouter.get('/projects/:id', (req: AuthRequest, res) => {
  const row = db.prepare(
    `SELECT * FROM rf_canvas_projects WHERE id = ? AND user_id = ?`
  ).get(req.params.id, req.user!.userId) as RfProjectRow | undefined
  if (!row) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  res.json({ success: true, data: rowToDetail(row) })
})

// Create project
rfCanvasRouter.post('/projects', (req: AuthRequest, res) => {
  const { name } = req.body || {}
  if (!validName(name)) {
    res.status(400).json({ success: false, error: '项目名称必填（1–50 字）' })
    return
  }
  const now = new Date().toISOString()
  const result = db.prepare(
    `INSERT INTO rf_canvas_projects (user_id, name, graph_json, node_count, created_at, updated_at)
     VALUES (?, ?, '{}', 0, ?, ?)`
  ).run(req.user!.userId, name.trim(), now, now)
  const row = db.prepare(`SELECT * FROM rf_canvas_projects WHERE id = ?`).get(
    result.lastInsertRowid
  ) as RfProjectRow
  res.json({ success: true, data: rowToListItem(row) })
})

// Update project (partial: name / graph / nodeCount)
rfCanvasRouter.patch('/projects/:id', (req: AuthRequest, res) => {
  const existing = db.prepare(
    `SELECT id FROM rf_canvas_projects WHERE id = ? AND user_id = ?`
  ).get(req.params.id, req.user!.userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }

  const { name, graph, nodeCount } = req.body || {}
  if (name === undefined && graph === undefined && nodeCount === undefined) {
    res.status(400).json({ success: false, error: '缺少可更新字段（name / graph / nodeCount）' })
    return
  }
  if (name !== undefined && !validName(name)) {
    res.status(400).json({ success: false, error: '项目名称必填（1–50 字）' })
    return
  }
  if (nodeCount !== undefined && (typeof nodeCount !== 'number' || !Number.isInteger(nodeCount) || nodeCount < 0)) {
    res.status(400).json({ success: false, error: 'nodeCount 必须是非负整数' })
    return
  }

  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [new Date().toISOString()]
  if (name !== undefined) {
    sets.push('name = ?')
    values.push(name.trim())
  }
  if (graph !== undefined) {
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
      res.status(400).json({ success: false, error: 'graph 必须是对象' })
      return
    }
    sets.push('graph_json = ?')
    values.push(JSON.stringify(graph))
  }
  if (nodeCount !== undefined) {
    sets.push('node_count = ?')
    values.push(nodeCount)
  }
  values.push(req.params.id, req.user!.userId)
  db.prepare(
    `UPDATE rf_canvas_projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...values)
  const updated = db.prepare(`SELECT updated_at FROM rf_canvas_projects WHERE id = ?`).get(
    req.params.id
  ) as { updated_at: string }
  res.json({ success: true, data: { id: Number(req.params.id), updatedAt: updated.updated_at } })
})

// Duplicate project (graph deep copy)
rfCanvasRouter.post('/projects/:id/duplicate', (req: AuthRequest, res) => {
  const original = db.prepare(
    `SELECT * FROM rf_canvas_projects WHERE id = ? AND user_id = ?`
  ).get(req.params.id, req.user!.userId) as RfProjectRow | undefined
  if (!original) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const now = new Date().toISOString()
  const result = db.prepare(
    `INSERT INTO rf_canvas_projects (user_id, name, graph_json, node_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.user!.userId, `${original.name} 副本`, original.graph_json, original.node_count, now, now)
  const row = db.prepare(`SELECT * FROM rf_canvas_projects WHERE id = ?`).get(
    result.lastInsertRowid
  ) as RfProjectRow
  res.json({ success: true, data: rowToListItem(row) })
})

// Delete project
rfCanvasRouter.delete('/projects/:id', (req: AuthRequest, res) => {
  const result = db.prepare(
    `DELETE FROM rf_canvas_projects WHERE id = ? AND user_id = ?`
  ).run(req.params.id, req.user!.userId)
  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  res.json({ success: true, data: { ok: true } })
})
