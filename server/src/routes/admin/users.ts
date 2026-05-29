import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { hashPassword } from '../../utils/password.js'

export const adminUsersRouter = Router()

adminUsersRouter.use(authMiddleware, adminMiddleware)

// List all users with optional search and tag filter
adminUsersRouter.get('/', (req: AuthRequest, res) => {
  const { search, tag } = req.query

  let sql = `
    SELECT u.*,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id) AS submitted_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'completed') AS completed_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'failed') AS failed_count,
      (SELECT MAX(created_at) FROM generation_tasks WHERE user_id = u.id) AS last_submitted_at
    FROM users u
  `
  const conditions: string[] = []
  const params: unknown[] = []

  if (search) {
    conditions.push(`u.username LIKE ?`)
    params.push(`%${search}%`)
  }

  if (tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM user_tag_mappings utm
      JOIN user_tags ut ON ut.id = utm.tag_id
      WHERE utm.user_id = u.id AND ut.name = ?
    )`)
    params.push(tag)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += ' ORDER BY u.created_at DESC'

  const users = db.prepare(sql).all(...params)
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

// ── Tag CRUD (must be before /:id routes) ──

// List all tags
adminUsersRouter.get('/tags', (_req: AuthRequest, res) => {
  const tags = db.prepare('SELECT * FROM user_tags ORDER BY name').all()
  res.json({ success: true, data: tags })
})

// Create a tag
adminUsersRouter.post('/tags', (req: AuthRequest, res) => {
  const { name, color } = req.body
  if (!name) {
    res.status(400).json({ success: false, error: '请输入标签名' })
    return
  }
  const existing = db.prepare('SELECT id FROM user_tags WHERE name = ?').get(name)
  if (existing) {
    res.status(409).json({ success: false, error: '标签已存在' })
    return
  }
  const result = db.prepare('INSERT INTO user_tags (name, color) VALUES (?, ?)')
    .run(name, color || '#409EFF')
  res.json({ success: true, data: { id: result.lastInsertRowid, name } })
})

// Delete a tag
adminUsersRouter.delete('/tags/:id', (req: AuthRequest, res) => {
  const tag = db.prepare('SELECT id FROM user_tags WHERE id = ?').get(req.params.id)
  if (!tag) {
    res.status(404).json({ success: false, error: '标签不存在' })
    return
  }
  db.prepare('DELETE FROM user_tags WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ── Single-user routes ──

// Get single user
adminUsersRouter.get('/:id', (req: AuthRequest, res) => {
  const user = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id) AS submitted_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'completed') AS completed_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'failed') AS failed_count,
      (SELECT MAX(created_at) FROM generation_tasks WHERE user_id = u.id) AS last_submitted_at,
      COALESCE((SELECT SUM(amount) FROM points_transactions WHERE user_id = u.id AND amount < 0), 0) AS total_spent,
      COALESCE((SELECT SUM(amount) FROM points_transactions WHERE user_id = u.id AND amount > 0), 0) AS total_recharged
    FROM users u
    WHERE u.id = ?
  `).get(req.params.id) as any

  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  res.json({ success: true, data: user })
})

// Edit user
adminUsersRouter.put('/:id', (req: AuthRequest, res) => {
  const { username, password, status, role, tags } = req.body
  const userId = req.params.id

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any
  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  const updates: string[] = []
  const params: unknown[] = []

  if (username !== undefined) {
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId)
    if (conflict) {
      res.status(409).json({ success: false, error: '用户名已存在' })
      return
    }
    updates.push('username = ?')
    params.push(username)
  }

  if (password !== undefined && password !== '') {
    updates.push('password_hash = ?')
    params.push(hashPassword(password))
  }

  if (status !== undefined) {
    if (!['active', 'disabled'].includes(status)) {
      res.status(400).json({ success: false, error: '状态值无效' })
      return
    }
    updates.push('status = ?')
    params.push(status)
  }

  if (role !== undefined) {
    if (!['admin', 'user'].includes(role)) {
      res.status(400).json({ success: false, error: '角色值无效' })
      return
    }
    updates.push('role = ?')
    params.push(role)
  }

  if (tags !== undefined) {
    updates.push('tags = ?')
    params.push(JSON.stringify(tags))

    // Sync user_tag_mappings
    db.prepare('DELETE FROM user_tag_mappings WHERE user_id = ?').run(userId)
    if (Array.isArray(tags) && tags.length > 0) {
      const insertMapping = db.prepare(
        'INSERT OR IGNORE INTO user_tag_mappings (user_id, tag_id) VALUES (?, ?)'
      )
      for (const tagName of tags) {
        let tagRow = db.prepare('SELECT id FROM user_tags WHERE name = ?').get(tagName) as any
        if (!tagRow) {
          const r = db.prepare('INSERT INTO user_tags (name) VALUES (?)').run(tagName)
          tagRow = { id: r.lastInsertRowid }
        }
        insertMapping.run(userId, tagRow.id)
      }
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(userId)
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  res.json({ success: true })
})

// Adjust user points (recharge or deduct)
adminUsersRouter.post('/:id/points', (req: AuthRequest, res) => {
  const { amount, note } = req.body
  const userId = req.params.id

  if (amount === undefined || amount === null || amount === 0) {
    res.status(400).json({ success: false, error: '请输入有效的金额' })
    return
  }

  const user = db.prepare('SELECT id, points FROM users WHERE id = ?').get(userId) as any
  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  const numericAmount = Number(amount)
  const newBalance = Math.round((user.points + numericAmount) * 1000) / 1000

  if (newBalance < 0) {
    res.status(400).json({ success: false, error: '积分不足，扣减后余额不能为负' })
    return
  }

  const reason = numericAmount > 0 ? 'admin_recharge' : 'admin_deduct'

  db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newBalance, userId)

  db.prepare(`
    INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, operator_id, note, created_at)
    VALUES (?, ?, ?, ?, 'admin', ?, ?, CURRENT_TIMESTAMP)
  `).run(userId, numericAmount, newBalance, reason, req.user!.userId, note || '')

  res.json({ success: true, data: { balance: newBalance } })
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
