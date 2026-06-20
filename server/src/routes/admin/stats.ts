import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { bjDay, bjWeek, bjMonth, bjDateRangeClause } from '../../utils/datetime.js'

export const adminStatsRouter = Router()

adminStatsRouter.use(authMiddleware, adminMiddleware)

adminStatsRouter.get('/users', (req: AuthRequest, res) => {
  const { start_date, end_date, user_id } = req.query
  // 日期条件放进 JOIN ON：范围外的任务不计入统计，但用户行仍保留（由 HAVING 过滤掉 0 活动）
  const range = bjDateRangeClause('t.created_at', start_date as string | undefined, end_date as string | undefined)
  const params: unknown[] = [...range.params]
  let userClause = ''
  if (user_id) {
    userClause = ' AND u.id = ?'
    params.push(Number(user_id))
  }

  const stats = db.prepare(`
    SELECT
      u.id AS user_id,
      u.username,
      u.role,
      u.status,
      u.points,
      COUNT(t.id) AS submitted_count,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      COALESCE(SUM(t.points_cost), 0) AS total_cost,
      MAX(t.created_at) AS last_submitted_at,
      MAX(CASE WHEN t.status = 'completed' THEN t.completed_at END) AS last_completed_at
    FROM users u
    LEFT JOIN generation_tasks t ON t.user_id = u.id${range.clause}
    WHERE u.role = 'user'${userClause}
    GROUP BY u.id
    HAVING submitted_count > 0
    ORDER BY submitted_count DESC
  `).all(...params)

  res.json({ success: true, data: stats })
})

// Daily/period stats（支持 day/week/month 分桶）
adminStatsRouter.get('/daily', (req: AuthRequest, res) => {
  const { start_date, end_date, user_id } = req.query
  const granularity = (req.query.granularity as string) || 'day'
  const bucket = granularity === 'month' ? bjMonth('created_at')
    : granularity === 'week' ? bjWeek('created_at')
    : bjDay('created_at')

  let where = 'WHERE 1=1'
  const params: unknown[] = []

  const range = bjDateRangeClause('created_at', start_date as string | undefined, end_date as string | undefined)
  if (range.clause) {
    where += range.clause
    params.push(...range.params)
  }
  if (user_id) {
    where += ' AND user_id = ?'
    params.push(Number(user_id))
  }

  const rows = db.prepare(`
    SELECT
      ${bucket} AS date,
      COUNT(*) AS total_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status NOT IN ('completed','failed') THEN 1 ELSE 0 END) AS in_progress,
      COALESCE(SUM(points_cost), 0) AS total_cost
    FROM generation_tasks
    ${where}
    GROUP BY ${bucket}
    ORDER BY date ASC
  `).all(...params)

  res.json({ success: true, data: rows })
})

// Trends (last 30 days)
adminStatsRouter.get('/trends', (req: AuthRequest, res) => {
  const days = parseInt(req.query.days as string) || 30
  const user_id = req.query.user_id as string | undefined

  // 窗口左沿 = 北京零点（N 天前）对应的 UTC 瞬时：先把 now 折算成北京日期，再回退到该日 UTC 零点-8h
  let where = `WHERE created_at >= datetime(DATE('now', '+8 hours'), '-8 hours', ?)`
  const params: unknown[] = [`-${days} days`]

  if (user_id) {
    where += ' AND user_id = ?'
    params.push(Number(user_id))
  }

  const rows = db.prepare(`
    SELECT
      ${bjDay('created_at')} AS date,
      COUNT(*) AS total_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM generation_tasks
    ${where}
    GROUP BY ${bjDay('created_at')}
    ORDER BY date ASC
  `).all(...params)

  res.json({ success: true, data: rows })
})

// Summary
adminStatsRouter.get('/summary', (req: AuthRequest, res) => {
  const { start_date, end_date, user_id } = req.query
  let where = 'WHERE 1=1'
  const params: unknown[] = []
  const range = bjDateRangeClause('created_at', start_date as string | undefined, end_date as string | undefined)
  if (range.clause) {
    where += range.clause
    params.push(...range.params)
  }
  if (user_id) {
    where += ' AND user_id = ?'
    params.push(Number(user_id))
  }

  const summary = db.prepare(`
    SELECT
      COUNT(*) AS total_tasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS total_completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS total_failed,
      COALESCE(SUM(points_cost), 0) AS total_points_consumed,
      COUNT(DISTINCT user_id) AS active_users
    FROM generation_tasks
    ${where}
  `).get(...params) as any

  // 总余额为当前全用户快照，与日期范围无关
  const balances = db.prepare(`
    SELECT COALESCE(SUM(points), 0) AS total_balance FROM users
  `).get() as any

  res.json({
    success: true,
    data: {
      ...summary,
      total_balance: balances.total_balance,
    },
  })
})
