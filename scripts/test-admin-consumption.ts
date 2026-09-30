/** 临时数据库 + 独立 JWT；不修改业务数据，不调用上游。 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-consumption-'))
process.env.MOMO_DB_PATH = path.join(dir, 'test.db')
process.env.JWT_SECRET = 'isolated-consumption-test-only'
const { db } = await import('../server/src/db/index.js')
const { signToken } = await import('../server/src/utils/jwt.js')
const { adminStatsRouter } = await import('../server/src/routes/admin/stats.js')
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, nickname TEXT, email TEXT, role TEXT, status TEXT, points REAL);
  CREATE TABLE generation_tasks (id INTEGER PRIMARY KEY, user_id INTEGER, task_no TEXT, model TEXT, status TEXT, points_cost REAL, created_at TEXT, completed_at TEXT);`)
const addUser = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)')
addUser.run(1, 'admin', '管理员', 'admin@test.invalid', 'admin', 'active', 99)
addUser.run(2, 'buyer', '买家', 'buyer@test.invalid', 'user', 'disabled', 25)
addUser.run(3, 'zero', null, null, 'user', 'active', 0)
addUser.run(4, 'no-tasks', null, null, 'user', 'active', 5)
addUser.run(5, 'literal_%', null, null, 'user', 'active', 5)
const addTask = db.prepare('INSERT INTO generation_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
let id = 0
function task(user: number, amount: number, date: string, status = 'completed') { id++; addTask.run(id, user, `gen-${id}`, 'test-model', status, amount, date, date) }
task(1, 1.11, '2025-12-31 16:00:00') // 北京 1/1 起点
// 北京 1/2 的运行任务；失败退款及零价任务不贡献消耗。
task(2, 2.22, '2026-01-01 16:00:00', 'running')
task(2, 0, '2026-01-02 00:00:00', 'failed')
task(3, 0, '2026-01-02 01:00:00')
task(1, 0.33, '2026-01-03 15:59:59.999') // 北京结束日期最后一毫秒
task(1, 40, '2025-12-31 15:59:59') // 不在区间
task(2, 50, '2026-01-03 16:00:00') // 次日零点不计入
task(5, 0, '2026-01-02 02:00:00')
const app = express()
app.use('/api/admin/stats', adminStatsRouter)
const server = app.listen(0, '127.0.0.1')
await new Promise<void>(resolve => server.once('listening', resolve))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin/stats/consumption`
const admin = signToken({ userId: 1, username: 'admin', role: 'admin' })
const user = signToken({ userId: 2, username: 'buyer', role: 'user' })
const range = { start_date: '2026-01-01', end_date: '2026-01-03' }
async function get(endpoint: string, extra: Record<string, string> = {}, token = admin) {
  return fetch(`${base}/${endpoint}?${new URLSearchParams({ ...range, ...extra })}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
}
async function data(endpoint: string, extra: Record<string, string> = {}) {
  const res = await get(endpoint, extra)
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.json()).data
}
try {
  for (const endpoint of ['overview', 'users', 'records']) {
    assert.equal((await get(endpoint, { user_id: '1' }, '')).status, 401)
    assert.equal((await get(endpoint, { user_id: '1' }, user)).status, 403)
    for (const extra of [{ start_date: '2026-02-30' }, { end_date: '2025-01-01' }, { start_date: '' }, { granularity: 'hour' }]) assert.equal((await get(endpoint, { user_id: '1', ...extra })).status, 400)
  }
  const overview = await data('overview')
  assert.deepEqual(overview.summary, { net_consumed: 3.66, submitted_count: 6, in_progress_credits: 2.22, consuming_users: 2 })
  assert.deepEqual(overview.trend.map((r: any) => r.net_consumed), [1.11, 2.22, 0.33])
  const all = await data('users')
  assert.equal(all.total, 4)
  assert.deepEqual(all.records.map((r: any) => r.user_id), [2, 1, 3, 5])
  assert.equal(all.records[0].status, 'disabled')
  assert.equal(all.records[1].role, 'admin')
  assert.equal(all.records[0].current_balance, 25)
  assert.equal(Math.round(all.records.reduce((s: number, r: any) => s + r.net_consumed, 0) * 100), Math.round(overview.summary.net_consumed * 100))
  assert.deepEqual((await data('users', { sort: 'submitted_count', order: 'asc' })).records.map((r: any) => r.user_id), [3, 5, 1, 2])
  assert.equal((await data('users', { pageSize: '1', page: '2' })).records[0].user_id, 1)
  assert.equal((await data('users', { page: '9' })).records.length, 0)
  for (const search of ['买家', 'buyer@test.invalid', 'buyer']) {
    const filtered = await data('overview', { search })
    assert.equal(filtered.summary.net_consumed, 2.22)
    assert.equal((await data('users', { search })).total, 1)
  }
  assert.equal((await data('users', { search: '_%' })).total, 1) // 通配符按普通文字匹配
  for (const granularity of ['day', 'week', 'month']) {
    const empty = await data('overview', { search: 'no-match', granularity })
    assert.equal(empty.summary.net_consumed, 0)
    assert(empty.trend.every((r: any) => r.net_consumed === 0))
  }
  const week = await data('overview', { start_date: '2025-12-30', end_date: '2026-01-06', granularity: 'week' })
  assert.deepEqual(week.trend.map((r: any) => r.date), ['2025-12-29', '2026-01-05'])
  assert.equal(week.trend[0].net_consumed, 93.66)
  assert.equal(week.trend[1].net_consumed, 0)
  const month = await data('overview', { start_date: '2025-12-31', end_date: '2026-02-01', granularity: 'month' })
  assert.deepEqual(month.trend.map((r: any) => r.date), ['2025-12-01', '2026-01-01', '2026-02-01'])
  assert.deepEqual(month.trend.map((r: any) => r.net_consumed), [40, 53.66, 0])
  const records = await data('records', { user_id: '2', pageSize: '1' })
  assert.equal(records.net_consumed, 2.22)
  assert.deepEqual(records.daily, [
    { date: '2026-01-01', net_consumed: 0 },
    { date: '2026-01-02', net_consumed: 2.22 },
    { date: '2026-01-03', net_consumed: 0 },
  ])
  assert.equal(Math.round(records.daily.reduce((sum: number, day: any) => sum + day.net_consumed, 0) * 100), Math.round(records.net_consumed * 100))
  const adminDaily = (await data('records', { user_id: '1' })).daily
  assert.deepEqual(adminDaily.map((day: any) => day.net_consumed), [1.11, 0, 0.33])
  assert.deepEqual((await data('records', { user_id: '1', granularity: 'month', search: 'buyer' })).daily, adminDaily)

  assert.equal(records.total, 2)
  assert.equal(records.records[0].status, 'failed')
  assert.deepEqual(Object.keys(records.records[0]).sort(), ['id', 'task_no', 'created_at', 'model', 'status', 'net_consumed'].sort())
  const next = await data('records', { user_id: '2', page: '2', pageSize: '1' })
  assert.equal(next.records[0].net_consumed, 2.22)
  assert.deepEqual(next.daily, records.daily)
  assert.equal((await data('records', { user_id: '4' })).total, 0)
  assert((await data('records', { user_id: '4' })).daily.every((day: any) => day.net_consumed === 0))
  assert.equal((await get('records', { user_id: '999' })).status, 404)
  for (const extra of [{ page: '0' }, { pageSize: '101' }, { page: '1.2' }, { sort: 'points_cost; DROP TABLE users' }, { order: 'up' }]) assert.equal((await get('users', extra)).status, 400)
  for (const user_id of ['', '-1', 'abc', '1.5']) assert.equal((await get('records', { user_id })).status, 400)
  // 模拟后续退款：原区间统计随当前任务账目更新，金额、用户表和明细仍一致。
  db.prepare("UPDATE generation_tasks SET status = 'failed', points_cost = 0 WHERE id = 2").run()
  assert.equal((await data('overview')).summary.net_consumed, 1.44)
  assert.equal((await data('overview')).summary.in_progress_credits, 0)
  assert.equal((await data('overview')).summary.consuming_users, 1)
  assert.equal((await data('records', { user_id: '2' })).net_consumed, 0)
  assert((await data('records', { user_id: '2' })).daily.every((day: any) => day.net_consumed === 0))
  console.log('用户消耗接口通过：权限、全部账号、净消耗/预扣/退款、日期边界、跨年周/月、补零、搜索、排序分页、精简明细和非法输入。')
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
}
