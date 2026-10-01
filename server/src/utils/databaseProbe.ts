import { createRequire } from 'node:module'
import { Worker } from 'node:worker_threads'

/** Read-only, short-lock SQLite probe off the business event loop. No schema/pragma changes. */
function buildDatabaseProbe(dbPath: string) {
  const require = createRequire(import.meta.url)
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads')
    let db
    let Database
    try { Database = require(workerData.module) } catch { /* Fail closed without exposing paths. */ }
    parentPort.on('message', () => {
      try {
        if (!db) db = new Database(workerData.path, { readonly: true, fileMustExist: true, timeout: 100 })
        db.prepare('SELECT count(*) FROM sqlite_master').get()
        parentPort.postMessage({ ok: true })
      } catch { parentPort.postMessage({ ok: false }) }
    })
  `, { eval: true, workerData: { path: dbPath, module: require.resolve('better-sqlite3') } })
  worker.unref()
  let pending: { resolve: () => void; reject: () => void; timer: NodeJS.Timeout } | undefined
  let busy = false
  let stopped = false
  let available = true
  const failure = () => {
    worker.unref()
    available = false
    busy = false
    if (pending) { clearTimeout(pending.timer); pending.reject(); pending = undefined }
  }
  worker.on('error', failure)
  worker.on('exit', failure)
  worker.on('message', (result: { ok?: boolean }) => {
    worker.unref()
    busy = false
    if (!pending) return
    clearTimeout(pending.timer)
    const current = pending
    pending = undefined
    if (result.ok === true) current.resolve()
    else current.reject()
  })
  worker.unref()
  return {
    check(): Promise<void> {
      if (stopped || !available || busy) return Promise.reject(new Error('database_probe_unavailable'))
      busy = true
      worker.ref()
      return new Promise<void>((resolve, reject) => {
        const fail = () => reject(new Error('database_probe_failed'))
        const timer = setTimeout(() => {
          // Do not queue more jobs if a worker is stuck; retain busy until it responds.
          pending = undefined
          worker.unref()
          fail()
        }, 500)
        timer.unref()
        pending = { resolve, reject: fail, timer }
        try { worker.postMessage('check') } catch { failure() }
      })
    },
    async stop() {
      stopped = true
      failure()
      worker.ref()
      await worker.terminate()
    },
  }
}

/** Monitor setup failure must fail its health check, not prevent the business server from starting. */
export function createDatabaseProbe(dbPath: string): ReturnType<typeof buildDatabaseProbe> {
  try { return buildDatabaseProbe(dbPath) } catch {
    console.error('[diagnostics] database_probe_unavailable')
    return {
      check: () => Promise.reject(new Error('database_probe_unavailable')),
      stop: () => Promise.resolve(),
    }
  }
}
