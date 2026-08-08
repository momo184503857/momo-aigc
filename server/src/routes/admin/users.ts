import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { hashPassword } from '../../utils/password.js'

export const adminUsersRouter = Router()

adminUsersRouter.use(authMiddleware, adminMiddleware)

// List all users with optional search and sorting
adminUsersRouter.get('/', (req: AuthRequest, res) => {
  const { search, status, sort, order } = req.query

  let sql = `
    SELECT u.*,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id) AS submitted_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'completed') AS completed_count,
      (SELECT COUNT(*) FROM generation_tasks WHERE user_id = u.id AND status = 'failed') AS failed_count,
      (SELECT MAX(created_at) FROM generation_tasks WHERE user_id = u.id) AS last_submitted_at,
      COALESCE((SELECT SUM(amount) FROM points_transactions WHERE user_id = u.id AND amount < 0), 0) AS total_spent,
      COALESCE((SELECT SUM(amount) FROM points_transactions WHERE user_id = u.id AND amount > 0), 0) AS total_recharged
    FROM users u
  `
  const conditions: string[] = []
  const params: unknown[] = []

  if (search) {
    conditions.push(`u.username LIKE ? OR u.email LIKE ?`)
    params.push(`%${search}%`, `%${search}%`)
  }

  if (status) {
    conditions.push(`u.status = ?`)
    params.push(status)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  // 排序：白名单校验，防止 SQL 注入
  const SORTABLE = new Set(['points', 'total_spent', 'total_recharged', 'last_login_at'])
  const sortField = typeof sort === 'string' && SORTABLE.has(sort) ? sort : null
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC'
  sql += sortField
    ? ` ORDER BY ${sortField} ${sortOrder}`
    : ' ORDER BY u.created_at DESC'

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

// Edit user (status / role only)
adminUsersRouter.put('/:id', (req: AuthRequest, res) => {
  const { status, role } = req.body
  const userId = req.params.id

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any
  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  const updates: string[] = []
  const params: unknown[] = []

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

  db.transaction(() => {
    db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newBalance, userId)

    db.prepare(`
      INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, operator_id, note, created_at)
      VALUES (?, ?, ?, ?, 'admin', ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, numericAmount, newBalance, reason, req.user!.userId, note || '')
  })()

  res.json({ success: true, data: { balance: newBalance } })
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
