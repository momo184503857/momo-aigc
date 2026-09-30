/** 独立浏览器验收环境：临时 SQLite、真实登录/统计路由、不接入上游渠道。 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { createServer } from 'vite'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-consumption-preview-'))
process.env.MOMO_DB_PATH = path.join(dir, 'preview.db')
process.env.JWT_SECRET = 'isolated-consumption-preview-only'
const { db } = await import('../server/src/db/index.js')
const { hashPassword } = await import('../server/src/utils/password.js')
const { authRouter } = await import('../server/src/routes/auth.js')
const { meRouter } = await import('../server/src/routes/me.js')
const { adminStatsRouter } = await import('../server/src/routes/admin/stats.js')
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, nickname TEXT, email TEXT, role TEXT, status TEXT, points REAL, password_hash TEXT, theme_color TEXT, last_login_at TEXT, updated_at TEXT);
  CREATE TABLE generation_tasks (id INTEGER PRIMARY KEY, user_id INTEGER, task_no TEXT, model TEXT, status TEXT, points_cost REAL, created_at TEXT, completed_at TEXT);`)
const addUser = db.prepare('INSERT INTO users (id, username, nickname, email, role, status, points, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
addUser.run(1, 'consumption-test-admin', '统计验收管理员', 'test-admin@example.invalid', 'admin', 'active', 100, hashPassword('consumption-test-only'))
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const addTask = db.prepare('INSERT INTO generation_tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
let id = 0
for (let user = 1; user <= 25; user++) {
  if (user > 1) addUser.run(user, `preview-user-${user}`, `验收用户${user}`, `preview-${user}@example.invalid`, 'user', user === 2 ? 'disabled' : 'active', 100, '')
  const count = user === 1 ? 23 : user === 3 ? 0 : 1
  for (let n = 0; n < count; n++) {
    id++
    const status = user === 2 ? 'running' : n === 0 ? 'failed' : 'completed'
    const amount = user === 4 ? 0 : status === 'failed' ? 0 : 0.1 * user
    addTask.run(id, user, `preview-${id}`, 'fixture-model', status, amount, `${today} 00:00:00`, `${today} 00:00:00`)
  }
}
const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)
app.use('/api/me', meRouter)
// 可重复触发下一次读请求失败，用于浏览器验收错误重试；仅存在于临时测试服务。
let failures = 0
app.post('/__test/fail-next', (_req, res) => { failures = 2; res.json({ ok: true }) })
app.use('/api/admin/stats', (_req, res, next) => { if (failures) { failures--; res.status(500).json({ success: false, error: '验收模拟失败' }) } else next() }, adminStatsRouter)
app.get('/api/models/catalog', (_req, res) => res.json({ success: true, data: { platform: [], logicalModels: [] } }))
const api = app.listen(0, '127.0.0.1')
await new Promise<void>(resolve => api.once('listening', resolve))
const target = `http://127.0.0.1:${(api.address() as { port: number }).port}`
const vite = await createServer({ server: { host: '127.0.0.1', port: 5274, strictPort: true, proxy: { '/api': target, '/__test': target } } })
await vite.listen()
console.log('隔离浏览器验收 http://127.0.0.1:5274/admin.html#/consumption；账号 consumption-test-admin，密码 consumption-test-only（仅临时环境）')
let stopping = false
async function close() {
  if (stopping) return
  stopping = true
  await vite.close()
  await new Promise<void>(resolve => api.close(() => resolve()))
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
