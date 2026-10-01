// Isolated fault-injection fixture: no project DB, seed, upstream, or paid calls.
import express from 'express'
import { Diagnostics } from '../../server/src/utils/diagnostics.js'

const monitor = new Diagnostics(true, process.env.MONITOR_DIR!, process.env.MONITOR_TOKEN!, 50)
const app = express()
monitor.start()
app.use(monitor.middleware())
app.get('/api/internal/monitor/health', monitor.health(() => {}))
app.get('/api/internal/monitor/database', monitor.health(() => {}))
app.get('/block', (_req, res) => {
  res.json({ ok: true })
  setTimeout(() => {
    const until = Date.now() + 1400
    while (Date.now() < until) { /* Deliberate local-only main-thread stall. */ }
  }, 30)
})
app.get('/api/generations/:id/status', async (_req, res) => {
  await monitor.operation('poll', { taskNo: 'gen-20261001123456', providerId: 1 },
    () => new Promise(resolve => setTimeout(resolve, 1200)))
  res.json({ ok: true })
})
const server = app.listen(0, '127.0.0.1', () => {
  console.log(JSON.stringify({ port: (server.address() as { port: number }).port }))
})
process.on('SIGTERM', () => {
  server.close(() => { void monitor.stop().then(() => process.exit(0)) })
  setTimeout(() => process.exit(0), 1000).unref()
})
