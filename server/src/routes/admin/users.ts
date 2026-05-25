import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { hashPassword } from '../../utils/password.js'

export const adminUsersRouter = Router()

adminUsersRouter.use(authMiddleware, adminMiddleware)

// List all users
adminUsersRouter.get('/', (_req: AuthRequest, res) => {
  const users = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id) AS submitted_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'completed') AS completed_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'failed') AS failed_count,
      (SELECT MAX(created_at) FROM generation_tasks WHERE user_id = u.id) AS last_submitted_at
    FROM users u
    ORDER BY u.created_at DESC
  `).all()

  res.json({ success: true, data: users })
})

// Create user
adminUsersRouter.post('/', (req: AuthRequest, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    res.status(400).json({ success: false, error: '请输入用户名和密码' })
    return
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    res.status(409).json({ success: false, error: '用户名已存在' })
    return
  }

  const hash = hashPassword(password)
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username, hash, 'user')

  res.json({ success: true, data: { id: result.lastInsertRowid, username } })
})

// Reset password
adminUsersRouter.post('/:id/reset-password', (req: AuthRequest, res) => {
  const { new_password } = req.body

  if (!new_password) {
    res.status(400).json({ success: false, error: '请输入新密码' })
    return
  }

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
  if (!existing) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  const hash = hashPassword(new_password)
  db.prepare(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, req.params.id)

  res.json({ success: true })
})

// Enable/disable user
adminUsersRouter.patch('/:id/status', (req: AuthRequest, res) => {
  const { status } = req.body
  if (!['active', 'disabled'].includes(status)) {
    res.status(400).json({ success: false, error: '状态值无效' })
    return
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id) as any
  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  db.prepare(
    'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(status, req.params.id)

  res.json({ success: true })
})
