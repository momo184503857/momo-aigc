import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { adminMiddleware } from '../middleware/admin.js'

export const pointsRouter = Router()

// User: get own balance
pointsRouter.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare('SELECT id, points FROM users WHERE id = ?').get(req.user!.userId) as any
  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_spent,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_recharged
    FROM points_transactions WHERE user_id = ?
  `).get(req.user!.userId) as any

  res.json({
    success: true,
    data: {
      balance: user.points,
      total_spent: stats.total_spent,
      total_recharged: stats.total_recharged,
    },
  })
})

// User: get own transaction history
pointsRouter.get('/me/transactions', authMiddleware, (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20

  const countRow = db.prepare(
    'SELECT COUNT(*) as total FROM points_transactions WHERE user_id = ?'
  ).get(req.user!.userId) as any

  const rows = db.prepare(`
    SELECT *
    FROM points_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user!.userId, pageSize, (page - 1) * pageSize)

  res.json({
    success: true,
    data: {
      records: rows,
      total: countRow.total,
      page,
      pageSize,
    },
  })
})

// ── Admin points routes ──

export const adminPointsRouter = Router()
adminPointsRouter.use(authMiddleware, adminMiddleware)

// List all transactions
adminPointsRouter.get('/transactions', (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20
  const userId = req.query.user_id as string | undefined
  const reason = req.query.reason as string | undefined
  const startDate = req.query.start_date as string | undefined
  const endDate = req.query.end_date as string | undefined

  let where = 'WHERE 1=1'
  const params: unknown[] = []

  if (userId) {
    where += ' AND pt.user_id = ?'
    params.push(Number(userId))
  }
  if (reason) {
    where += ' AND pt.reason = ?'
    params.push(reason)
  }
  if (startDate) {
    where += ' AND pt.created_at >= ?'
    params.push(startDate)
  }
  if (endDate) {
    where += ' AND pt.created_at <= ?'
    params.push(endDate)
  }

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM points_transactions pt ${where}
  `).get(...params) as any

  const rows = db.prepare(`
    SELECT pt.*, u.username,
      COALESCE(op.username, '') AS operator_name
    FROM points_transactions pt
    JOIN users u ON u.id = pt.user_id
    LEFT JOIN users op ON op.id = pt.operator_id
    ${where}
    ORDER BY pt.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize)

  res.json({
    success: true,
    data: {
      records: rows,
      total: countRow.total,
      page,
      pageSize,
    },
  })
})
