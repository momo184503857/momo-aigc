import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { ensureInstance, killProjectInstance } from '../nodered/manager.js'

/**
 * AI画布 Pro（Node-RED 版）项目 API。
 *
 * 项目数据本体（flow_json/creds_json）由 Node-RED 子进程的 storage 模块直写
 * nr_canvas_projects 表（每次 Deploy 实时落库），本路由只管项目元信息 CRUD 与
 * 编辑器会话（ensureInstance → 返回 /red 编辑器地址）。
 */

export const flowCanvasRouter = Router()

flowCanvasRouter.use(authMiddleware)

// ─── Project CRUD ───

flowCanvasRouter.get('/projects', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rows = db
    .prepare(
      `SELECT id, name, node_count, created_at, updated_at
       FROM nr_canvas_projects WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(userId)
  res.json({ success: true, data: rows })
})

flowCanvasRouter.get('/projects/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const row = db
    .prepare(
      `SELECT id, name, node_count, created_at, updated_at
       FROM nr_canvas_projects WHERE id = ? AND user_id = ?`
    )
    .get(req.params.id, userId)
  if (!row) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  res.json({ success: true, data: row })
})

flowCanvasRouter.post('/projects', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { name } = req.body || {}
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `INSERT INTO nr_canvas_projects (user_id, name, credential_secret, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, name || '未命名画布', crypto.randomBytes(24).toString('hex'), now, now)
  const project = db
    .prepare('SELECT id, name, node_count, created_at, updated_at FROM nr_canvas_projects WHERE id = ?')
    .get(result.lastInsertRowid)
  res.json({ success: true, data: project })
})

flowCanvasRouter.put('/projects/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { name } = req.body || {}
  const existing = db
    .prepare('SELECT id FROM nr_canvas_projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  if (typeof name === 'string' && name.trim()) {
    db.prepare('UPDATE nr_canvas_projects SET name = ?, updated_at = ? WHERE id = ?').run(
      name.trim(),
      new Date().toISOString(),
      req.params.id
    )
  }
  const updated = db
    .prepare('SELECT id, name, node_count, created_at, updated_at FROM nr_canvas_projects WHERE id = ?')
    .get(req.params.id)
  res.json({ success: true, data: updated })
})

flowCanvasRouter.post('/projects/:id/duplicate', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const original = db
    .prepare('SELECT * FROM nr_canvas_projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as
    | { name: string; flow_json: string; description?: string }
    | undefined
  if (!original) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  const now = new Date().toISOString()
  // 副本使用新的 credential_secret，节点凭据（creds_json）不复用 —— 凭据按旧密钥加密，跨密钥复制会解密失败
  const result = db
    .prepare(
      `INSERT INTO nr_canvas_projects (user_id, name, flow_json, credential_secret, node_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      `${original.name} (副本)`,
      original.flow_json || '',
      crypto.randomBytes(24).toString('hex'),
      0,
      now,
      now
    )
  const project = db
    .prepare('SELECT id, name, node_count, created_at, updated_at FROM nr_canvas_projects WHERE id = ?')
    .get(result.lastInsertRowid)
  res.json({ success: true, data: project })
})

flowCanvasRouter.delete('/projects/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const existing = db
    .prepare('SELECT id FROM nr_canvas_projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  killProjectInstance(userId, Number(req.params.id))
  db.prepare('DELETE FROM nr_canvas_projects WHERE id = ? AND user_id = ?').run(req.params.id, userId)
  res.json({ success: true })
})

// ─── Editor session ───

flowCanvasRouter.post('/projects/:id/session', async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const projectId = Number(req.params.id)
  const row = db
    .prepare('SELECT id FROM nr_canvas_projects WHERE id = ? AND user_id = ?')
    .get(projectId, userId)
  if (!row) {
    res.status(404).json({ success: false, error: '项目不存在' })
    return
  }
  try {
    const inst = await ensureInstance(userId, projectId)
    // accessToken = 实例 token（用户自己的应用 JWT）：iframe ?access_token= 桥接、
    // 子进程 adminAuth 比对、节点回环 API 三处一致使用
    res.json({
      success: true,
      data: { editorUrl: `/red/u/${userId}/p/${projectId}/`, accessToken: inst.token },
    })
  } catch (err) {
    res.status(503).json({ success: false, error: (err as Error).message || '画布实例启动失败' })
  }
})
