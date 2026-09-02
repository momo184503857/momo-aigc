#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import Database from 'better-sqlite3'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const freePort = () => new Promise((resolve) => {
  const server = net.createServer()
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    server.close(() => resolve(port))
  })
})

function mockChannel({ succeeds }) {
  const calls = []
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    if (req.method === 'POST' && req.url === '/v1/images/generations') {
      calls.push(req.headers.authorization || '')
      req.on('data', () => {})
      req.on('end', () => {
        res.setHeader('content-type', 'application/json')
        if (!succeeds.value) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: { message: 'mock channel failed' } }))
        } else {
          res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('mock-image').toString('base64') }] }))
        }
      })
      return
    }
    res.statusCode = 404
    res.end()
  })
  return { server, calls, requests }
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

async function api(base, method, pathname, token, body) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, data: await response.json() }
}

async function waitForServer(base) {
  for (let i = 0; i < 80; i++) {
    try {
      const result = await api(base, 'POST', '/api/auth/login', '', { username: 'admin', password: 'admin123' })
      if (result.status === 200) return result.data.data.token
    } catch {}
    await sleep(100)
  }
  throw new Error('test server did not start')
}

async function waitTask(base, token, id) {
  for (let i = 0; i < 100; i++) {
    const result = await api(base, 'GET', `/api/generations/${id}/status`, token)
    if (['completed', 'failed'].includes(result.data.data.status)) return result.data.data
    await sleep(50)
  }
  throw new Error(`task ${id} did not finish`)
}

const dir = mkdtempSync(path.join(tmpdir(), 'momoaigc-routing-'))
const dbPath = path.join(dir, 'test.db')
const firstState = { value: false }
const secondState = { value: true }
const first = mockChannel({ succeeds: firstState })
const second = mockChannel({ succeeds: secondState })
const firstPort = await listen(first.server)
const secondPort = await listen(second.server)
const appPort = await freePort()
const app = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, MOMO_DB_PATH: dbPath, PORT: String(appPort) },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let stderr = ''
app.stderr.on('data', (chunk) => { stderr += chunk })

try {
  const base = `http://127.0.0.1:${appPort}`
  const token = await waitForServer(base)
  const db = new Database(dbPath)
  db.prepare(`UPDATE users SET points = 100 WHERE username = 'admin'`).run()
  db.prepare(`UPDATE ai_models SET status = 'disabled' WHERE supports_image_gen = 1`).run()
  const logical = db.prepare(`SELECT id FROM ai_logical_models WHERE code = 'gpt-image-2'`).get()
  db.prepare(`UPDATE ai_logical_models SET sale_pricing = ? WHERE id = ?`).run(JSON.stringify({ '1K': 2.5, '2K': 3, '4K': 4 }), logical.id)

  const insertProvider = db.prepare(`INSERT INTO api_providers (code, name, base_url, adapter, status) VALUES (?, ?, ?, 'openai_image', 'active')`)
  const p1 = Number(insertProvider.run('route-cheap', 'Cheap', `http://127.0.0.1:${firstPort}`).lastInsertRowid)
  const p2 = Number(insertProvider.run('route-backup', 'Backup', `http://127.0.0.1:${secondPort}`).lastInsertRowid)
  const insertKey = db.prepare(`
    INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, priority, status)
    VALUES (?, ?, ?, '', '', 'test', ?, 'active')
  `)
  insertKey.run(p1, 'primary', 'cheap-primary', 1)
  insertKey.run(p1, 'secondary-must-not-run', 'cheap-secondary', 2)
  insertKey.run(p2, 'primary', 'backup-primary', 1)
  const insertModel = db.prepare(`
    INSERT INTO ai_models
      (provider_id, model_id, display_name, supports_vision, supports_image_gen, logical_model_id, cost_pricing, status)
    VALUES (?, ?, ?, 1, 1, ?, ?, 'active')
  `)
  insertModel.run(p1, 'cheap-model', 'Cheap model', logical.id, JSON.stringify({ '1K': 1 }))
  insertModel.run(p2, 'backup-model', 'Backup model', logical.id, JSON.stringify({ '1K': 2 }))

  const catalog = await api(base, 'GET', '/api/models/catalog?kind=image', token)
  assert.equal(catalog.status, 200)
  assert.ok(Array.isArray(catalog.data.data.models))
  assert.equal(catalog.data.data.platform, undefined)
  assert.equal(JSON.stringify(catalog.data).includes('Cheap'), false)

  const submit = await api(base, 'POST', '/api/generations', token, {
    logicalModelId: logical.id, prompt: 'routing test', aspectRatio: '1:1', resolution: '1K', n: 1,
  })
  assert.equal(submit.status, 200)
  const taskId = submit.data.data.tasks[0].id
  let completed
  try {
    completed = await waitTask(base, token, taskId)
  } catch (error) {
    console.error({ firstRequests: first.requests, secondRequests: second.requests, stderr })
    throw error
  }
  assert.equal(completed.status, 'completed')
  const attempts = db.prepare(`SELECT provider_id, status, cost_price FROM generation_route_attempts WHERE task_id = ? ORDER BY attempt_no`).all(taskId)
  assert.deepEqual(attempts, [
    { provider_id: p1, status: 'failed', cost_price: 1 },
    { provider_id: p2, status: 'succeeded', cost_price: 2 },
  ])
  assert.deepEqual(first.calls, ['Bearer cheap-primary'])
  assert.deepEqual(second.calls, ['Bearer backup-primary'])
  assert.equal(db.prepare(`SELECT points FROM users WHERE username = 'admin'`).get().points, 97.5)

  secondState.value = false
  const failedSubmit = await api(base, 'POST', '/api/generations', token, {
    logicalModelId: logical.id, prompt: 'all fail test', aspectRatio: '1:1', resolution: '1K', n: 1,
  })
  const failedTaskId = failedSubmit.data.data.tasks[0].id
  const failed = await waitTask(base, token, failedTaskId)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.errorCode, 'ROUTES_EXHAUSTED')
  assert.equal(db.prepare(`SELECT points FROM users WHERE username = 'admin'`).get().points, 97.5)
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM generation_route_attempts WHERE task_id = ?`).get(failedTaskId).count, 2)
  console.log('[PASS] 用户目录仅返回逻辑模型与统一售价')
  console.log('[PASS] 最低成本渠道失败后直接切换次低渠道')
  console.log('[PASS] 同渠道第二把 Key 未被调用')
  console.log('[PASS] 售价只预扣一次，全部渠道失败全额退款')
} finally {
  app.kill('SIGTERM')
  first.server.close()
  second.server.close()
  await sleep(100)
  if (stderr && app.exitCode && app.exitCode !== 0) process.stderr.write(stderr)
}
