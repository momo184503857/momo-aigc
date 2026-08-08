import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { bjDateRangeClause } from '../../utils/datetime.js'

export const adminActivityRouter = Router()

adminActivityRouter.use(authMiddleware, adminMiddleware)

// 统一活动日志：生图任务 + 非生成计费流水（充值/扣减）合成一张表。
// 生成计费的流水（reference_type='generation_task'）由对应任务行代表，此处排除以免重复。
adminActivityRouter.get('/', (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20
  const user = req.query.user as string | undefined
  const taskId = req.query.task_id as string | undefined
  const startDate = req.query.start_date as string | undefined
  const endDate = req.query.end_date as string | undefined
  const type = req.query.type as string | undefined // 'task' | 'txn'，缺省=全部
  const status = req.query.status as string | undefined // 仅对生成行生效

  // 用户模糊匹配：匹配用户名 / 昵称 / 邮箱
  const userClause = user
    ? ` AND (u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)`
    : ''
  const userParams = user ? [`%${user}%`, `%${user}%`, `%${user}%`] : []

  // 任务 ID 模糊匹配（toapis_task_id，tsk 开头业务号）；仅对生成行生效
  const taskIdClause = taskId ? ` AND t.toapis_task_id LIKE ?` : ''
  const taskIdParams = taskId ? [`%${taskId}%`] : []

  // ── 任务分支 ──
  let taskWhere = 'WHERE 1=1'
  const taskParams: unknown[] = []
  if (status) {
    taskWhere += ' AND t.status = ?'
    taskParams.push(status)
  }
  if (user) {
    taskWhere += userClause
    taskParams.push(...userParams)
  }
  if (taskId) {
    taskWhere += taskIdClause
    taskParams.push(...taskIdParams)
  }
  const taskRange = bjDateRangeClause('t.created_at', startDate, endDate)
  if (taskRange.clause) {
    taskWhere += taskRange.clause
    taskParams.push(...taskRange.params)
  }

  // ── 流水分支（排除生成计费行）──
  let txnWhere = 'WHERE (pt.reference_type IS NULL OR pt.reference_type <> ?)'
  const txnParams: unknown[] = ['generation_task']
  if (user) {
    txnWhere += userClause
    txnParams.push(...userParams)
  }
  const txnRange = bjDateRangeClause('pt.created_at', startDate, endDate)
  if (txnRange.clause) {
    txnWhere += txnRange.clause
    txnParams.push(...txnRange.params)
  }

  const branches: string[] = []
  const allParams: unknown[] = []

  if (type !== 'txn') {
    branches.push(`
      SELECT 'task' AS type, t.id AS id, t.toapis_task_id, t.user_id, u.username,
             t.model, t.prompt, t.status,
             -t.points_cost AS amount, t.points_balance_after AS balance_after,
             'generation' AS reason, '' AS operator_name, '' AS note,
             t.created_at
      FROM generation_tasks t
      LEFT JOIN users u ON u.id = t.user_id
      ${taskWhere}
    `)
    allParams.push(...taskParams)
  }

  if (type !== 'task') {
    branches.push(`
      SELECT 'txn' AS type, pt.id AS id, NULL AS toapis_task_id, pt.user_id, u.username,
             NULL AS model, NULL AS prompt, NULL AS status,
             pt.amount AS amount, pt.balance_after AS balance_after,
             pt.reason AS reason, COALESCE(op.username, '') AS operator_name, COALESCE(pt.note, '') AS note,
             pt.created_at
      FROM points_transactions pt
      JOIN users u ON u.id = pt.user_id
      LEFT JOIN users op ON op.id = pt.operator_id
      ${txnWhere}
    `)
    allParams.push(...txnParams)
  }

  const unionSql = branches.join(' UNION ALL ')

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM (${unionSql}) AS u`).get(...allParams) as any

  const rows = db.prepare(`
    SELECT * FROM (${unionSql}) AS u
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...allParams, pageSize, (page - 1) * pageSize)

  res.json({
    success: true,
    data: { records: rows, total: countRow.total, page, pageSize },
  })
})
