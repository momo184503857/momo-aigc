import '../config.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs/promises'
import { readFileSync, constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { performance, monitorEventLoopDelay } from 'node:perf_hooks'
import type { RequestHandler } from 'express'
import type Database from 'better-sqlite3'

type Phase = 'submit' | 'poll' | 'result_import' | 'image_proxy' | 'upstream_headers'
type Details = { taskNo?: string; providerId?: number; httpStatus?: number; bytes?: number }
type Active = { id: string; started: number; requestId?: string; phase?: Phase; route?: string; method?: string; taskNo?: string; providerId?: number }
type Entry = Record<string, unknown>

const MAX_TRACKED = 256
const MAX_QUEUE = 512
const ROTATE_BYTES = 2 * 1024 * 1024
const SAFE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENOSPC', 'EACCES', 'EROFS', 'SQLITE_BUSY', 'SQLITE_LOCKED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'])

function errorKind(error: unknown): string {
  const value = error as { code?: string; name?: string; cause?: { code?: string } }
  const code = value?.cause?.code ?? value?.code
  if (code && SAFE_CODES.has(code)) return code
  return value?.name === 'AbortError' || value?.name === 'TimeoutError' ? value.name : 'operation_error'
}

// Never retain arbitrary URL path segments, query strings, bodies or exception messages.
function safeRoute(url: string): string {
  const first = url.split('?')[0].split('/').filter(Boolean)
  const groups = new Set(['auth', 'me', 'oss', 'templates', 'tasks', 'generations', 'models', 'prompts', 'admin', 'toolbox', 'feature-prompts', 'proxy', 'toapis', 'points', 'canvas', 'canvas-ai', 'photography', 'buyer-show', 'buyer-show-batch', 'files', 'thumbnails'])
  if (first[0] !== 'api' || !groups.has(first[1] ?? '')) return '/other'
  const endpoints = new Set(['status', 'summary', 'reimport', 'image', 'catalog', 'stats', 'daily', 'activity', 'users', 'login', 'register'])
  return '/api/' + first.slice(1, 6).map((segment, i) => i === 0 || endpoints.has(segment) ? segment : ':value').join('/')
}

function safeDetails(details: Details): Entry {
  const out: Entry = {}
  if (details.taskNo && /^gen-\d{12,20}$/.test(details.taskNo)) out.taskNo = details.taskNo
  if (Number.isSafeInteger(details.providerId) && details.providerId! > 0) out.providerId = details.providerId
  if (Number.isInteger(details.httpStatus) && details.httpStatus! >= 100 && details.httpStatus! <= 599) out.httpStatus = details.httpStatus
  if (Number.isFinite(details.bytes) && details.bytes! >= 0) out.bytes = details.bytes
  return out
}

/** A bounded async sink. No sync filesystem work or exception text in business paths. */
class Sink {
  private queue: string[] = []
  private pending: Promise<void> | undefined
  private bytes = 0
  private initialized = false
  private lastWarning = 0
  dropped = 0

  constructor(private directory: string) {}

  add(entry: Entry) {
    if (this.queue.length >= MAX_QUEUE) { this.dropped++; return }
    const line = JSON.stringify(entry) + '\n'
    if (Buffer.byteLength(line) > 32 * 1024) { this.dropped++; return }
    this.queue.push(line)
    void this.flush()
  }

  flush(): Promise<void> {
    if (this.pending) return this.pending
    this.pending = this.drain().finally(() => { this.pending = undefined })
    return this.pending
  }

  private async drain() {
    try {
      const file = path.join(this.directory, 'events.jsonl')
      if (!this.initialized) {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
        const directoryStat = await fs.lstat(this.directory)
        if (directoryStat.isSymbolicLink()) throw new Error('unsafe_directory')
        try {
          const stat = await fs.lstat(file)
          if (stat.isSymbolicLink()) throw new Error('unsafe_log')
          this.bytes = stat.size
          await fs.chmod(file, 0o600)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          this.bytes = 0
        }
        this.initialized = true
      }
      while (this.queue.length) {
        const lines = this.queue.splice(0, 32).join('')
        if (this.bytes >= ROTATE_BYTES) {
          await fs.rename(file, path.join(this.directory, `events-${Date.now()}-${randomUUID()}.jsonl`))
          this.bytes = 0
          const old = (await fs.readdir(this.directory)).filter(name => /^events-\d+-[a-f\d-]+\.jsonl$/.test(name)).sort()
          await Promise.all(old.slice(0, -10).map(name => fs.unlink(path.join(this.directory, name))))
        }
        // Refuse symlinks even if an existing active file was replaced after startup.
        const handle = await fs.open(file, fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600)
        try { await handle.writeFile(lines) } finally { await handle.close() }
        this.bytes += Buffer.byteLength(lines)
      }
    } catch {
      this.dropped += this.queue.length
      this.queue = []
      this.initialized = false
      // Rate-limited, fixed fallback; never log filesystem paths or exception messages.
      if (Date.now() - this.lastWarning > 60_000) {
        this.lastWarning = Date.now()
        console.error('[diagnostics] local_write_failed; monitoring evidence may be incomplete')
      }
    }
  }
}

export class Diagnostics {
  private context = new AsyncLocalStorage<{ requestId?: string; taskNo?: string; providerId?: number }>()
  private requests = new Map<string, Active>()
  private operations = new Map<string, Active>()
  private requestCount = 0
  private operationCount = 0
  private sink: Sink | undefined
  private timer: NodeJS.Timeout | undefined
  private lag: ReturnType<typeof monitorEventLoopDelay> | undefined
  private lastSample = performance.now()
  private lastCpu = process.cpuUsage()
  private lastUtilization = performance.eventLoopUtilization()

  constructor(readonly enabled: boolean, directory: string, private token: string, private sampleMs = 5000) {
    if (enabled) this.sink = new Sink(path.join(directory, 'app'))
  }

  private emit(event: string, data: Entry) {
    this.sink?.add({ timestamp: new Date().toISOString(), event, pid: process.pid, ...data })
  }

  start() {
    if (!this.enabled || this.timer) return
    this.lag = monitorEventLoopDelay({ resolution: 20 })
    this.lag.enable()
    this.timer = setInterval(() => this.sample(), this.sampleMs)
    this.timer.unref()
    this.emit('diagnostics_start', {})
  }

  snapshot() {
    const now = performance.now()
    const list = (map: Map<string, Active>) => [...map.values()]
      .sort((a, b) => a.started - b.started).slice(0, 24)
      .map(({ started, ...entry }) => ({ ...entry, elapsedMs: Math.round(now - started) }))
    return { pid: process.pid, uptimeSeconds: Math.round(process.uptime()), requestCount: this.requestCount, operationCount: this.operationCount,
      trackedRequests: list(this.requests), trackedOperations: list(this.operations), droppedLogs: this.sink?.dropped ?? 0 }
  }

  sample() {
    if (!this.enabled) return
    const now = performance.now()
    const cpu = process.cpuUsage()
    const utilization = performance.eventLoopUtilization()
    const delta = performance.eventLoopUtilization(utilization, this.lastUtilization)
    const lagMs = this.lag ? this.lag.max / 1e6 : 0
    this.emit('metrics', { ...this.snapshot(), sampleElapsedMs: Math.round(now - this.lastSample),
      cpuPercent: (cpu.user + cpu.system - this.lastCpu.user - this.lastCpu.system) / ((now - this.lastSample) * 10),
      rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed,
      eventLoopMaxMs: Number.isFinite(lagMs) ? Math.round(lagMs) : 0, eventLoopUtilization: delta.utilization })
    this.lastSample = now
    this.lastCpu = cpu
    this.lastUtilization = utilization
    this.lag?.reset()
  }

  middleware(): RequestHandler {
    return (req, res, next) => {
      if (!this.enabled || req.path.startsWith('/api/internal/monitor/')) { next(); return }
      const requestId = randomUUID()
      const start = performance.now()
      const route = safeRoute(req.originalUrl)
      const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER'
      this.requestCount++
      if (this.requests.size < MAX_TRACKED) this.requests.set(requestId, { id: requestId, started: start, route, method })
      res.setHeader('X-Request-Id', requestId)
      this.emit('request_start', { requestId, route, method })
      let ended = false
      const end = (disconnected: boolean) => {
        if (ended) return
        ended = true
        this.requests.delete(requestId)
        this.requestCount--
        const elapsedMs = Math.round(performance.now() - start)
        this.emit('request_end', { requestId, route, method, elapsedMs, status: res.statusCode, disconnected, slow: elapsedMs >= 3000 })
      }
      res.once('finish', () => end(false))
      res.once('close', () => end(!res.writableFinished))
      this.context.run({ requestId }, next)
    }
  }

  health(check: () => unknown): RequestHandler {
    return async (req, res) => {
      const address = req.socket.remoteAddress
      const provided = req.get('X-Monitor-Token') ?? ''
      const authorized = !!this.token && provided.length <= 256 && Buffer.byteLength(provided) === Buffer.byteLength(this.token)
        && timingSafeEqual(Buffer.from(provided), Buffer.from(this.token))
      if (!this.enabled || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') || !authorized) {
        res.status(404).end(); return
      }
      res.setHeader('Cache-Control', 'no-store')
      try {
        const started = performance.now()
        await check()
        res.json({ ok: true, checkedMs: Math.round(performance.now() - started), ...this.snapshot() })
      } catch {
        res.status(503).json({ ok: false, reason: 'database_check_failed' })
      }
    }
  }

  begin(phase: Phase, details: Details = {}) {
    if (!this.enabled) return (_error?: unknown, _endDetails?: Details) => {}
    const id = randomUUID()
    const started = performance.now()
    const requestId = this.context.getStore()?.requestId
    const inherited = this.context.getStore()
    const fields = { operationId: id, phase, requestId, ...safeDetails(inherited ?? {}), ...safeDetails(details) }
    this.operationCount++
    if (this.operations.size < MAX_TRACKED) this.operations.set(id, { id, started, requestId, phase, ...safeDetails(inherited ?? {}), ...safeDetails(details) })
    this.emit('operation_start', fields)
    let ended = false
    return (error?: unknown, endDetails: Details = {}) => {
      if (ended) return
      ended = true
      this.operationCount--
      this.operations.delete(id)
      const elapsedMs = Math.round(performance.now() - started)
      this.emit('operation_end', { ...fields, ...safeDetails(endDetails), elapsedMs, slow: elapsedMs >= 10_000,
        outcome: error === undefined ? 'ok' : 'error', ...(error === undefined ? {} : { errorKind: errorKind(error) }) })
    }
  }

  async operation<T>(phase: Phase, details: Details, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn()
    const end = this.begin(phase, details)
    try {
      const result = await this.context.run({ ...this.context.getStore(), ...safeDetails(details) }, fn)
      end()
      return result
    } catch (error) { end(error); throw error }
  }

  database<T>(operation: string, fingerprint: string, fn: () => T): T {
    if (!this.enabled) return fn()
    const started = performance.now()
    let failed = false
    let kind: string | undefined
    try { return fn() } catch (error) { failed = true; kind = errorKind(error); throw error } finally {
      const elapsedMs = performance.now() - started
      if (elapsedMs >= 200 || failed) this.emit('database_slow', { requestId: this.context.getStore()?.requestId,
        operation, fingerprint, elapsedMs: Math.round(elapsedMs), failed, errorKind: kind })
    }
  }

  async stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.lag?.disable()
    await this.sink?.flush()
  }

  flush() { return this.sink?.flush() ?? Promise.resolve() }
}

function monitorToken(): string {
  if (process.env.MONITOR_ENABLED !== '1') return ''
  try {
    return process.env.MONITOR_TOKEN_FILE
      ? readFileSync(process.env.MONITOR_TOKEN_FILE, 'utf8').trim()
      : process.env.MONITOR_TOKEN || ''
  } catch {
    console.error('[diagnostics] token_file_unavailable; health probes will be rejected')
    return ''
  }
}

export const diagnostics = new Diagnostics(process.env.MONITOR_ENABLED === '1',
  process.env.MONITOR_DIR || path.resolve('server/data/monitor'), monitorToken())

/** Instrument statement executions without logging SQL/arguments, wrapping transactions, or replacing business errors. */
export function instrumentDatabase(database: Database.Database, monitor = diagnostics) {
  if (!monitor.enabled) return
  const prepare = database.prepare
  database.prepare = function (this: Database.Database, sql: string) {
    const statement = prepare.call(this, sql)
    const fingerprint = createHash('sha256').update(sql).digest('hex').slice(0, 16)
    for (const method of ['run', 'get', 'all'] as const) {
      const original = statement[method]
      Object.defineProperty(statement, method, { configurable: true, writable: true, value:
        function (this: Database.Statement, ...args: unknown[]) {
          return monitor.database(method, fingerprint, () => Reflect.apply(original, this, args))
        } })
    }
    return statement
  } as typeof database.prepare
}

/** Header/connect timing only; caller's enclosing phase covers response-body consumption. */
export async function diagnosticFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (!diagnostics.enabled) return globalThis.fetch(input, init)
  const end = diagnostics.begin('upstream_headers')
  try { const result = await globalThis.fetch(input, init); end(undefined, { httpStatus: result.status }); return result }
  catch (error) { end(error); throw error }
}
