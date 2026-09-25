/** 隔离数据库及独立测试 JWT，绝不改动业务数据库，不调用上传或生图。 */
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momo-toolbox-test-'))
process.env.MOMO_DB_PATH = path.join(dir, 'test.db')
process.env.JWT_SECRET = 'isolated-toolbox-test-only'
const { db } = await import('../server/src/db/index.js')
const { signToken } = await import('../server/src/utils/jwt.js')
const { toolboxRouter, adminToolboxRouter } = await import('../server/src/routes/toolbox.js')
db.exec('CREATE TABLE system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
db.prepare('INSERT INTO system_config VALUES (?, ?)').run('private_test_key', 'not-public')
const app = express()
app.use(express.json())
app.use('/api/toolbox', toolboxRouter)
app.use('/api/admin/toolbox', adminToolboxRouter)
const server = app.listen(0, '127.0.0.1')
await new Promise<void>(resolve => server.once('listening', resolve))
const address = server.address() as { port: number }
const base = `http://127.0.0.1:${address.port}/api`
const admin = signToken({ userId: 1, username: 'test-admin', role: 'admin' })
const user = signToken({ userId: 2, username: 'test-user', role: 'user' })
const put = (imageUrl: unknown, token = admin, id = 'batch-clothes-swap') => fetch(`${base}/admin/toolbox/images/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ imageUrl }) })
try {
  let data = (await (await fetch(`${base}/toolbox/images`)).json()).data
  assert.equal(Object.keys(data).length, 4)
  assert.equal(data.private_test_key, undefined)
  assert(Object.values(data).every(v => v === ''))
  assert.equal((await put('/api/files/test.png', '')).status, 401)
  assert.equal((await put('/api/files/test.png', user)).status, 403)
  for (const invalid of [null, 42, 'javascript:alert(1)', 'data:image/png;base64,abc', '//example.com/x.png']) assert.equal((await put(invalid)).status, 400)
  assert.equal((await put('', admin, 'unknown')).status, 404)
  for (const url of ['/api/files/materials/test.png', 'https://example.com/oss/test.png', '']) {
    assert.equal((await put(url)).status, 200)
    data = (await (await fetch(`${base}/toolbox/images`)).json()).data
    assert.equal(data['batch-clothes-swap'], url)
    assert.equal(data['batch-face-swap'], '')
  }
  console.log('工具介绍图接口通过：空配置、读写清空、direct/OSS 地址、权限、非法输入、私密配置隔离。')
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
}
