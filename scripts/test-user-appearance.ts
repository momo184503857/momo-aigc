/** 隔离数据库及独立 JWT，验证账号主题色读写，不改动业务数据。 */
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-appearance-test-'))
process.env.MOMO_DB_PATH = path.join(dir, 'test.db')
process.env.JWT_SECRET = 'isolated-appearance-test-only'

const { db } = await import('../server/src/db/index.js')
const { initSchema } = await import('../server/src/db/schema.js')
const { hashPassword } = await import('../server/src/utils/password.js')
const { signToken } = await import('../server/src/utils/jwt.js')
const { authRouter } = await import('../server/src/routes/auth.js')
const { meRouter } = await import('../server/src/routes/me.js')

initSchema()
const password = 'appearance-test-password'
const passwordHash = hashPassword(password)
const firstId = Number(db.prepare('INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, ?)')
  .run('appearance-one', passwordHash, 'user', 'active').lastInsertRowid)
const secondId = Number(db.prepare('INSERT INTO users (username, password_hash, role, status, theme_color) VALUES (?, ?, ?, ?, ?)')
  .run('appearance-two', passwordHash, 'user', 'active', 'violet').lastInsertRowid)

const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)
app.use('/api/me', meRouter)
const server = app.listen(0, '127.0.0.1')
await new Promise<void>(resolve => server.once('listening', resolve))
const address = server.address() as { port: number }
const base = `http://127.0.0.1:${address.port}/api`
const firstToken = signToken({ userId: firstId, username: 'appearance-one', role: 'user' })
const secondToken = signToken({ userId: secondId, username: 'appearance-two', role: 'user' })
const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

try {
  assert.equal((await fetch(`${base}/me`)).status, 401)

  const loginResponse = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'appearance-one', password }),
  })
  assert.equal(loginResponse.status, 200)
  assert.equal((await loginResponse.json()).data.user.theme_color, 'orange')

  for (const themeColor of ['orange', 'blue', 'violet', 'rose', 'cyan']) {
    const response = await fetch(`${base}/me/appearance`, {
      method: 'PUT', headers: authHeaders(firstToken), body: JSON.stringify({ theme_color: themeColor }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).data.theme_color, themeColor)
    const current = await fetch(`${base}/me`, { headers: authHeaders(firstToken) })
    assert.equal((await current.json()).data.theme_color, themeColor)
  }

  for (const invalid of ['', 'green', '#ff0000', null, 42]) {
    const response = await fetch(`${base}/me/appearance`, {
      method: 'PUT', headers: authHeaders(firstToken), body: JSON.stringify({ theme_color: invalid }),
    })
    assert.equal(response.status, 400)
  }
  assert.equal((db.prepare('SELECT theme_color FROM users WHERE id = ?').get(firstId) as any).theme_color, 'cyan')
  const second = await fetch(`${base}/me`, { headers: authHeaders(secondToken) })
  assert.equal((await second.json()).data.theme_color, 'violet')

  console.log('账号主题色接口通过：默认值、五色读写、登录返回、非法值拒绝、账号隔离。')
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
}
