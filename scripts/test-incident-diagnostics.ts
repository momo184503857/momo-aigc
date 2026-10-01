import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import Database from 'better-sqlite3'
import { Diagnostics, instrumentDatabase } from '../server/src/utils/diagnostics.js'

const token = 'a'.repeat(64)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const root = () => fs.mkdtemp(path.join(os.tmpdir(), 'momo-monitor-test-'))
async function events(directory: string) {
  const raw = await fs.readFile(path.join(directory, 'app', 'events.jsonl'), 'utf8')
  return { raw, rows: raw.trim().split('\n').map(line => JSON.parse(line)) }
}
async function listen(app: express.Express) {
  const server = await new Promise<http.Server>(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` }
}
async function close(server: http.Server) {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}

test('request correlation, query/body/error redaction, authorized local health and in-flight cleanup', async () => {
  const directory = await root()
  const monitor = new Diagnostics(true, directory, token, 50)
  const app = express()
  monitor.start()
  app.use(monitor.middleware())
  app.use(express.json())
  app.get('/api/internal/monitor/health', monitor.health(() => {}))
  app.get('/api/internal/monitor/database', monitor.health(() => { throw new Error('secret-database-error') }))
  app.post('/api/generations/:id/status', async (_req, res) => {
    await monitor.operation('poll', { taskNo: 'gen-20261001123456', providerId: 7 }, async () => {
      await sleep(30)
      try { await monitor.operation('submit', {}, async () => { throw new Error('secret-upstream-error') }) } catch { /* fixture */ }
    })
    res.json({ ok: true })
  })
  const { server, base } = await listen(app)
  try {
    const remoteHandler = monitor.health(() => { throw new Error('must-not-run') })
    let rejected = 0
    await remoteHandler({ socket: { remoteAddress: '10.0.0.5' }, get: () => token } as never,
      { status: (code: number) => { rejected = code; return { end: () => {} } } } as never, () => {})
    assert.equal(rejected, 404)
    assert.equal((await fetch(base + '/api/internal/monitor/health')).status, 404)
    assert.equal((await fetch(base + '/api/internal/monitor/health', { headers: { 'X-Monitor-Token': token, 'X-Forwarded-For': '8.8.8.8' } })).status, 200)
    assert.equal((await fetch(base + '/api/internal/monitor/health', { headers: { 'X-Monitor-Token': 'wrong', 'X-Forwarded-For': '127.0.0.1' } })).status, 404)
    const bad = await fetch(base + '/api/internal/monitor/database', { headers: { 'X-Monitor-Token': token } })
    assert.equal(bad.status, 503)
    assert.doesNotMatch(await bad.text(), /secret/)
    const response = await fetch(base + '/api/generations/secret-path/status?token=secret-query', {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer secret-header' }, body: JSON.stringify({ prompt: 'secret-body' }),
    })
    await response.text()
    assert.equal(response.status, 200)
    assert.match(response.headers.get('X-Request-Id')!, /^[a-f0-9-]{36}$/)
    await sleep(80)
    assert.equal(monitor.snapshot().requestCount, 0)
    assert.equal(monitor.snapshot().operationCount, 0)
    await monitor.flush()
    const log = await events(directory)
    assert.doesNotMatch(log.raw, /secret-|Bearer|prompt|token=/)
    const start = log.rows.find(row => row.event === 'request_start')
    const ops = log.rows.filter(row => row.event === 'operation_end')
    assert.equal(ops.length, 2)
    assert.ok(ops.every(row => row.requestId === start.requestId && row.taskNo === 'gen-20261001123456' && row.providerId === 7))
    assert.ok(log.rows.some(row => row.event === 'metrics'))
    assert.ok(log.rows.some(row => row.event === 'request_end' && !row.disconnected))
    assert.equal((await fs.stat(path.join(directory, 'app', 'events.jsonl'))).mode & 0o777, 0o600)
  } finally { await close(server); await monitor.stop(); await fs.rm(directory, { recursive: true, force: true }) }
})

test('client disconnect and failed operation do not leak tracked counts', async () => {
  const directory = await root()
  const monitor = new Diagnostics(true, directory, token)
  const app = express()
  app.use(monitor.middleware())
  app.get('/api/proxy/image', (_req, res) => { res.write('partial') })
  const { server, base } = await listen(app)
  try {
    await new Promise<void>(resolve => {
      const request = http.get(base + '/api/proxy/image', response => {
        response.once('data', () => { request.destroy(); resolve() })
      })
      request.on('error', () => {})
    })
    await sleep(40)
    assert.equal(monitor.snapshot().requestCount, 0)
    const original = new Error('secret-original-error')
    await assert.rejects(monitor.operation('submit', {}, async () => { throw original }), error => error === original)
    assert.equal(monitor.snapshot().operationCount, 0)
    const done = monitor.begin('image_proxy')
    done(new Error('private-error'))
    done()
    assert.equal(monitor.snapshot().operationCount, 0)
    await monitor.flush()
    assert.ok((await events(directory)).rows.some(row => row.event === 'request_end' && row.disconnected))
  } finally { await close(server); await monitor.stop(); await fs.rm(directory, { recursive: true, force: true }) }
})

test('SQLite instrumentation preserves native bindings, transactions, errors and fingerprints only', async () => {
  const directory = await root()
  const monitor = new Diagnostics(true, directory, token)
  const database = new Database(':memory:')
  try {
    instrumentDatabase(database, monitor)
    database.exec('CREATE TABLE example (id INTEGER PRIMARY KEY, value TEXT UNIQUE)')
    const insert = database.prepare('INSERT INTO example(value) VALUES(?)')
    const tx = database.transaction(() => insert.run('secret-value'))
    assert.equal(tx().changes, 1)
    assert.deepEqual(database.prepare('SELECT value FROM example WHERE id = ?').get(1), { value: 'secret-value' })
    assert.equal(database.prepare('SELECT * FROM example').all().length, 1)
    assert.equal([...database.prepare('SELECT * FROM example').iterate()].length, 1)
    assert.equal(database.prepare('SELECT * FROM example WHERE id=?').bind(1).get() !== undefined, true)
    assert.throws(() => insert.run('secret-value'), /UNIQUE/)
    assert.equal(database.inTransaction, false)
    monitor.database('get', '1234567890abcdef', () => {
      const until = Date.now() + 210
      while (Date.now() < until) { /* local slow SQL timing surrogate */ }
    })
    await monitor.flush()
    const log = await events(directory)
    assert.doesNotMatch(log.raw, /secret|INSERT|SELECT|UNIQUE|example/)
    assert.ok(log.rows.some(row => row.event === 'database_slow' && row.failed))
    assert.ok(log.rows.some(row => row.event === 'database_slow' && row.elapsedMs >= 200))
    assert.ok(log.rows.every(row => row.event !== 'database_slow' || /^[a-f0-9]{16}$/.test(row.fingerprint)))
  } finally { database.close(); await monitor.stop(); await fs.rm(directory, { recursive: true, force: true }) }
})

test('disabled mode creates no files and leaves database methods untouched', async () => {
  const directory = await root()
  const monitor = new Diagnostics(false, directory, '')
  const database = new Database(':memory:')
  const prepare = database.prepare
  instrumentDatabase(database, monitor)
  monitor.start()
  assert.equal(await monitor.operation('submit', {}, async () => 42), 42)
  monitor.sample()
  await monitor.stop()
  assert.equal(database.prepare, prepare)
  assert.deepEqual(await fs.readdir(directory), [])
  database.close()
  await fs.rm(directory, { recursive: true, force: true })
})

test('bounded tracking, queue saturation, rotation and write failure remain non-fatal', async () => {
  const directory = await root()
  await fs.mkdir(path.join(directory, 'app'))
  await fs.writeFile(path.join(directory, 'app', 'events.jsonl'), 'x'.repeat(2 * 1024 * 1024))
  const monitor = new Diagnostics(true, directory, token)
  try {
    const finishers = Array.from({ length: 600 }, () => monitor.begin('poll'))
    assert.equal(monitor.snapshot().operationCount, 600)
    assert.equal(monitor.snapshot().trackedOperations.length, 24)
    assert.ok(monitor.snapshot().droppedLogs > 0)
    finishers.forEach(end => end())
    assert.equal(monitor.snapshot().operationCount, 0)
    await monitor.flush()
    assert.ok((await fs.readdir(path.join(directory, 'app'))).some(name => name.startsWith('events-')))
    assert.ok((await fs.stat(path.join(directory, 'app', 'events.jsonl'))).size < 2 * 1024 * 1024)
    const blocker = path.join(directory, 'secret-file')
    await fs.writeFile(blocker, 'secret')
    const broken = new Diagnostics(true, blocker, token)
    assert.equal(await broken.operation('submit', {}, async () => 'business-success'), 'business-success')
    await broken.flush()
    assert.equal(await fs.readFile(blocker, 'utf8'), 'secret')
    await broken.stop()
  } finally { await monitor.stop(); await fs.rm(directory, { recursive: true, force: true }) }
})

test('reject symlink log without overwriting the target', async () => {
  const directory = await root()
  await fs.mkdir(path.join(directory, 'app'))
  const target = path.join(directory, 'untouched')
  await fs.writeFile(target, 'keep-me')
  await fs.symlink(target, path.join(directory, 'app', 'events.jsonl'))
  const monitor = new Diagnostics(true, directory, token)
  await monitor.operation('poll', {}, async () => 1)
  await monitor.stop()
  assert.equal(await fs.readFile(target, 'utf8'), 'keep-me')
  await fs.rm(directory, { recursive: true, force: true })
})

test('read-only SQLite probe is isolated from business loop and rejects lock waits promptly', async () => {
  const { createDatabaseProbe } = await import('../server/src/utils/databaseProbe.js')
  const directory = await root()
  const database = new Database(path.join(directory, 'test.sqlite'))
  database.exec('CREATE TABLE example (id INTEGER)')
  const probe = createDatabaseProbe(path.join(directory, 'test.sqlite'))
  try {
    await probe.check()
    database.exec('BEGIN EXCLUSIVE')
    let timerRan = false
    const timer = setTimeout(() => { timerRan = true }, 10)
    const started = Date.now()
    await assert.rejects(probe.check(), /database_probe_failed/)
    assert.ok(Date.now() - started < 700)
    assert.ok(timerRan, 'SQLite lock wait must not block main event loop')
    clearTimeout(timer)
    database.exec('ROLLBACK')
    await probe.check()
    const missing = createDatabaseProbe(path.join(directory, 'missing.sqlite'))
    await assert.rejects(missing.check())
    await missing.stop()
    await assert.rejects(fs.stat(path.join(directory, 'missing.sqlite')), { code: 'ENOENT' })
  } finally { await probe.stop(); database.close(); await fs.rm(directory, { recursive: true, force: true }) }
})
