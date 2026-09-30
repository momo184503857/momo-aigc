import { Router, type Request, type Response } from 'express'
import { db } from '../../db/index.js'

export const adminConsumptionRouter = Router()
type Granularity = 'day' | 'week' | 'month'
interface Filter { start: string; end: string; search: string; granularity: Granularity }
class InvalidQuery extends Error {}
function queryError(error: unknown, res: Response) {
  if (error instanceof InvalidQuery) res.status(400).json({ success: false, error: error.message })
  else { console.error('[Consumption] 查询失败', error); res.status(500).json({ success: false, error: '统计查询失败，请重试' }) }
}
const DAY = 86400000
const money = (expression: string) => `ROUND(COALESCE(SUM(${expression}), 0), 2)`
const cost = money('COALESCE(t.points_cost, 0)')
const source = 'FROM generation_tasks t JOIN users u ON u.id = t.user_id'

function scalar(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback
  if (typeof value !== 'string') throw new InvalidQuery('参数格式无效')
  return value
}
function date(value: unknown): string {
  const text = scalar(value)
  const parsed = new Date(`${text}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number(text.slice(0, 4)) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new InvalidQuery('请选择有效日期')
  return text
}
function filter(req: Request): Filter {
  const start = date(req.query.start_date)
  const end = date(req.query.end_date)
  if (start > end) throw new InvalidQuery('开始日期不能晚于结束日期')
  const granularity = scalar(req.query.granularity, 'day')
  if (!['day', 'week', 'month'].includes(granularity)) throw new InvalidQuery('统计周期无效')
  return { start, end, search: scalar(req.query.search).trim(), granularity: granularity as Granularity }
}
function positive(value: unknown, fallback?: number, max = Number.MAX_SAFE_INTEGER): number {
  const text = scalar(value, fallback === undefined ? '' : String(fallback))
  const result = Number(text)
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(result) || result < 1 || result > max) throw new InvalidQuery('分页或用户参数无效')
  return result
}
function pagination(req: Request) {
  const page = positive(req.query.page, 1, 1000000)
  const pageSize = positive(req.query.pageSize, 20, 100)
  return { page, pageSize, offset: (page - 1) * pageSize }
}
function where(f: Filter, userId?: number) {
  // 半开区间包含结束日期全天，兼容小数秒时间戳。
  let sql = "WHERE t.created_at >= datetime(?, '-8 hours') AND t.created_at < datetime(?, '+1 day', '-8 hours')"
  const params: (string | number)[] = [f.start, f.end]
  if (userId !== undefined) { sql += ' AND t.user_id = ?'; params.push(userId) }
  if (f.search) {
    sql += " AND (u.username LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"
    const search = `%${f.search.replace(/[\\%_]/g, '\\$&')}%`
    params.push(search, search, search)
  }
  return { sql, params }
}
function bucket(granularity: Granularity) {
  if (granularity === 'month') return "strftime('%Y-%m-01', t.created_at, '+8 hours')"
  if (granularity === 'week') return "date(t.created_at, '+8 hours', '-' || ((CAST(strftime('%w', t.created_at, '+8 hours') AS INTEGER) + 6) % 7) || ' days')"
  return "date(t.created_at, '+8 hours')"
}
function periodStart(value: string, granularity: Granularity): Date {
  const result = new Date(`${value}T00:00:00Z`)
  if (granularity === 'month') result.setUTCDate(1)
  if (granularity === 'week') result.setUTCDate(result.getUTCDate() - (result.getUTCDay() + 6) % 7)
  return result
}

function consumptionTrend(f: Filter, userId?: number) {
  const { sql, params } = where(f, userId)
  const expression = bucket(f.granularity)
  const rows = db.prepare(`SELECT ${expression} AS date, ${cost} AS net_consumed ${source} ${sql} GROUP BY ${expression} ORDER BY date`).all(...params) as { date: string; net_consumed: number }[]
  const byDate = new Map(rows.map(row => [row.date, row.net_consumed]))
  const trend: { date: string; net_consumed: number }[] = []
  const cursor = periodStart(f.start, f.granularity)
  const end = periodStart(f.end, f.granularity)
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10)
    trend.push({ date, net_consumed: byDate.get(date) ?? 0 })
    if (f.granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    else cursor.setTime(cursor.getTime() + DAY * (f.granularity === 'week' ? 7 : 1))
  }
  return trend
}

adminConsumptionRouter.get('/overview', (req, res) => {
  try {
    const f = filter(req)
    const { sql, params } = where(f)
    const summary = db.prepare(`SELECT ${cost} AS net_consumed, COUNT(*) AS submitted_count,
      ${money("CASE WHEN t.status NOT IN ('completed', 'failed') THEN COALESCE(t.points_cost, 0) ELSE 0 END")} AS in_progress_credits,
      (SELECT COUNT(*) FROM (SELECT t.user_id ${source} ${sql} GROUP BY t.user_id HAVING ${cost} > 0)) AS consuming_users
      ${source} ${sql}`).get(...params, ...params)
    const trend = consumptionTrend(f)
    res.json({ success: true, data: { summary, trend } })
  } catch (error) { queryError(error, res) }
})

adminConsumptionRouter.get('/users', (req, res) => {
  try {
    const f = filter(req)
    const { sql, params } = where(f)
    const { page, pageSize, offset } = pagination(req)
    const sort = scalar(req.query.sort, 'net_consumed')
    const order = scalar(req.query.order, 'desc')
    if (!['net_consumed', 'submitted_count'].includes(sort) || !['asc', 'desc'].includes(order)) throw new InvalidQuery('排序参数无效')
    const count = db.prepare(`SELECT COUNT(DISTINCT t.user_id) AS total ${source} ${sql}`).get(...params) as { total: number }
    const records = db.prepare(`SELECT u.id AS user_id, u.username, u.nickname, u.role, u.status, u.points AS current_balance,
      ${cost} AS net_consumed, COUNT(*) AS submitted_count,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed_count, MAX(t.created_at) AS last_submitted_at
      ${source} ${sql} GROUP BY u.id ORDER BY ${sort} ${order}, u.id ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset)
    res.json({ success: true, data: { records, total: count.total, page, pageSize } })
  } catch (error) { queryError(error, res) }
})

adminConsumptionRouter.get('/records', (req, res) => {
  try {
    const f = filter(req)
    const userId = positive(req.query.user_id)
    const { sql, params } = where({ ...f, search: '' }, userId)
    const { page, pageSize, offset } = pagination(req)
    const user = db.prepare('SELECT id AS user_id, username, nickname, role, status FROM users WHERE id = ?').get(userId)
    if (!user) { res.status(404).json({ success: false, error: '用户不存在' }); return }
    const summary = db.prepare(`SELECT ${cost} AS net_consumed, COUNT(*) AS total ${source} ${sql}`).get(...params) as { net_consumed: number; total: number }
    const records = db.prepare(`SELECT t.id, t.task_no, t.created_at, t.model, t.status, COALESCE(t.points_cost, 0) AS net_consumed
      ${source} ${sql} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset)
    res.json({ success: true, data: { user, net_consumed: summary.net_consumed, daily: consumptionTrend({ ...f, search: '', granularity: 'day' }, userId), records, total: summary.total, page, pageSize } })
  } catch (error) { queryError(error, res) }
})
