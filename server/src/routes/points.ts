import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { bjDay, bjWeek, bjMonth, bjDateRangeClause } from '../utils/datetime.js'
import { calculateCost } from '../utils/pricing.js'

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
      COALESCE(SUM(CASE WHEN reason = 'admin_recharge' THEN amount ELSE 0 END), 0) AS total_recharged
    FROM points_transactions WHERE user_id = ?
  `).get(req.user!.userId) as any
  // 净消耗：generation_tasks.points_cost（失败退款已清零），与每日趋势同口径
  const consumed = db.prepare(
    `SELECT COALESCE(SUM(points_cost), 0) AS total_consumed FROM generation_tasks WHERE user_id = ?`
  ).get(req.user!.userId) as any

  res.json({
    success: true,
    data: {
      balance: user.points,
      total_spent: stats.total_spent,
      total_recharged: stats.total_recharged,
      total_consumed: consumed.total_consumed,
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

// User: daily/period consumption + recharge (按 日/周/月 聚合本人的平台/个人 Key 消耗与充值)
// 平台消耗 = generation_tasks.points_cost（净，失败退款已清零；个人 Key 任务 points_cost=0 不计入）。
// 个人 Key 消耗 = 无 generation 流水的任务（个人模式）按平台单价 calculateCost 折算（实际 ToAPIs 花费以用户账户为准）。
// 充值 = points_transactions reason='admin_recharge'。按日期合并返回。
pointsRouter.get('/me/daily', authMiddleware, (req: AuthRequest, res) => {
  const { start_date, end_date } = req.query
  const granularity = (req.query.granularity as string) || 'day'
  const bucket = granularity === 'month' ? bjMonth('created_at')
    : granularity === 'week' ? bjWeek('created_at')
    : bjDay('created_at')
  const bucketT = granularity === 'month' ? bjMonth('t.created_at')
    : granularity === 'week' ? bjWeek('t.created_at')
    : bjDay('t.created_at')
  const range = bjDateRangeClause('created_at', start_date as string | undefined, end_date as string | undefined)
  const rangeT = bjDateRangeClause('t.created_at', start_date as string | undefined, end_date as string | undefined)
  const userId = req.user!.userId

  // 平台消耗（净）
  const tasks = db.prepare(`
    SELECT ${bucket} AS date, COALESCE(SUM(points_cost), 0) AS spent, COUNT(*) AS count
    FROM generation_tasks
    WHERE user_id = ?${range.clause}
    GROUP BY ${bucket}
  `).all(userId, ...range.params) as { date: string; spent: number; count: number }[]

  // 充值
  const recharges = db.prepare(`
    SELECT ${bucket} AS date, COALESCE(SUM(amount), 0) AS recharged
    FROM points_transactions
    WHERE user_id = ? AND reason = 'admin_recharge'${range.clause}
    GROUP BY ${bucket}
  `).all(userId, ...range.params) as { date: string; recharged: number }[]

  // 个人 Key 消耗：无 generation 流水的任务（个人模式），按 calculateCost 折算；
  // 仅计非失败任务（与平台侧「失败不计消耗」一致：平台失败已退款 points_cost=0）
  const personalTasks = db.prepare(`
    SELECT ${bucketT} AS date, model, resolution, n
    FROM generation_tasks t
    WHERE t.user_id = ?${rangeT.clause}
      AND t.status != 'failed'
      AND NOT EXISTS (SELECT 1 FROM points_transactions pt WHERE pt.reference_id = t.id AND pt.reason = 'generation')
  `).all(userId, ...rangeT.params) as { date: string; model: string; resolution: string | null; n: number }[]
  const personalByDate = new Map<string, number>()
  for (const pt of personalTasks) {
    const cost = calculateCost(pt.model, pt.resolution || '', pt.n || 1)
    personalByDate.set(pt.date, (personalByDate.get(pt.date) || 0) + cost)
  }

  // 按日期合并
  const map = new Map<string, { date: string; spent: number; personal: number; recharged: number; count: number }>()
  for (const t of tasks) map.set(t.date, { date: t.date, spent: t.spent, personal: 0, recharged: 0, count: t.count })
  for (const r of recharges) {
    const e = map.get(r.date) ?? { date: r.date, spent: 0, personal: 0, recharged: 0, count: 0 }
    e.recharged = r.recharged
    map.set(r.date, e)
  }
  for (const [date, personal] of personalByDate) {
    const e = map.get(date) ?? { date, spent: 0, personal: 0, recharged: 0, count: 0 }
    e.personal = personal
    map.set(date, e)
  }
  const rows = [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1))

  res.json({ success: true, data: rows })
})
