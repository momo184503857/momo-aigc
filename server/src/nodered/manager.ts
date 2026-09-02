import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { signToken } from '../utils/jwt.js'
import { db } from '../db/index.js'

/**
 * Node-RED 画布实例管理（AI画布 Pro）。
 *
 * 官方明确不支持在同一 Node 进程内跑多个完整 runtime（模块单例状态），
 * 因此每个打开的画布项目 = 一个独立子进程（launcher.cjs），仅监听 127.0.0.1，
 * 由 proxy.ts 反向代理。生命周期：懒启动 → 空闲回收（Deploy 时 flows 已实时落库，
 * 回收零数据丢失，下次访问自动重启恢复）。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// dev（server/src/nodered）与产物（server/dist/nodered）相对路径一致，均为 server/nodered/
const LAUNCHER = path.resolve(__dirname, '../../nodered/launcher.cjs')

const MAX_INSTANCES = Number(process.env.NR_MAX_INSTANCES || 6)
const IDLE_MS = Number(process.env.NR_IDLE_MINUTES || 30) * 60_000
const PORT_BASE = 19100
const PORT_MAX = 19199
const READY_TIMEOUT_MS = 30_000

interface InstanceRecord {
  key: string
  userId: number
  projectId: number
  port: number
  /** spawn 时铸造的实例 token：编辑器免登录桥接 + 子进程 adminAuth 比对 + 节点回环 API 调用，三处共用 */
  token: string
  child: ChildProcess
  lastActive: number
  ready: Promise<void>
}

const instances = new Map<string, InstanceRecord>()
let sweeper: ReturnType<typeof setInterval> | null = null

function allocatePort(): number {
  const used = new Set([...instances.values()].map((i) => i.port))
  for (let p = PORT_BASE; p <= PORT_MAX; p++) {
    if (!used.has(p)) return p
  }
  throw new Error('Node-RED 端口池耗尽')
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

function killInstance(key: string): void {
  const inst = instances.get(key)
  if (!inst) return
  instances.delete(key)
  try {
    inst.child.kill('SIGTERM')
  } catch {
    /* already dead */
  }
  setTimeout(() => {
    try {
      if (inst.child.exitCode === null) inst.child.kill('SIGKILL')
    } catch {
      /* noop */
    }
  }, 5000).unref()
  console.log(`[nodered] 实例已回收 u${inst.userId} p${inst.projectId} :${inst.port}`)
}

/** 淘汰最久未活跃实例（容量不足时） */
function evictLRU(): void {
  let oldest: InstanceRecord | null = null
  for (const inst of instances.values()) {
    if (!oldest || inst.lastActive < oldest.lastActive) oldest = inst
  }
  if (oldest) killInstance(oldest.key)
}

export interface EnsuredInstance {
  port: number
  token: string
}

/**
 * 确保 (userId, projectId) 的 Node-RED 实例在运行。
 * 返回端口与实例 token（供前端拼编辑器 ?access_token=，与子进程内 adminAuth 精确比对一致）。
 * 就绪等待基于子进程 stdout 行协议（NR_READY / NR_ERROR:）。
 */
export async function ensureInstance(userId: number, projectId: number): Promise<EnsuredInstance> {
  const key = `${userId}:${projectId}`
  const existing = instances.get(key)
  if (existing && existing.child.exitCode === null) {
    existing.lastActive = Date.now()
    await existing.ready
    return { port: existing.port, token: existing.token }
  }
  if (existing) instances.delete(key)

  const row = db
    .prepare('SELECT credential_secret FROM nr_canvas_projects WHERE id = ? AND user_id = ?')
    .get(projectId, userId) as { credential_secret: string } | undefined
  if (!row) throw new Error('画布项目不存在')

  if (instances.size >= MAX_INSTANCES) evictLRU()

  const port = allocatePort()
  if (!(await isPortFree(port))) throw new Error(`Node-RED 端口 ${port} 被占用`)

  // 实例 token：该用户的应用 JWT（7d），编辑器鉴权与节点回环 API 调用共用
  const instanceToken = signToken({ userId, username: `nr-u${userId}`, role: 'user' })

  const child = spawn(
    process.execPath,
    [
      LAUNCHER,
      JSON.stringify({
        port,
        userId,
        projectId,
        dbPath: config.dbPath,
        apiBase: `http://127.0.0.1:${config.port}`,
        instanceToken,
        credentialSecret: row.credential_secret || crypto.randomBytes(24).toString('hex'),
      }),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const inst: InstanceRecord = {
    key,
    userId,
    projectId,
    port,
    token: instanceToken,
    child,
    lastActive: Date.now(),
    ready: Promise.resolve(),
  }
  instances.set(key, inst)

  inst.ready = new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => finish(new Error('Node-RED 实例启动超时')), READY_TIMEOUT_MS)
    timer.unref?.()

    function finish(err: Error | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) {
        try {
          child.kill('SIGKILL')
        } catch {
          /* noop */
        }
        if (instances.get(key) === inst) instances.delete(key)
        reject(err)
      } else {
        resolve()
      }
    }

    let buf = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        if (line.startsWith('NR_READY')) {
          console.log(`[nodered] 实例就绪 u${userId} p${projectId} :${port}`)
          finish(null)
        } else if (line.startsWith('NR_ERROR:')) {
          finish(new Error(line.slice('NR_ERROR:'.length)))
        } else {
          console.log(`[nodered u${userId}p${projectId}] ${line}`)
        }
      }
    })
    child.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.error(`[nodered u${userId}p${projectId}] ${text}`)
    })
    child.once('error', (err) => finish(err instanceof Error ? err : new Error(String(err))))
    child.once('exit', (code) => {
      if (!settled) finish(new Error(`Node-RED 实例进程异常退出 (code=${code})`))
      if (instances.get(key) === inst) instances.delete(key)
    })
  })

  await inst.ready
  return { port, token: instanceToken }
}

/** 空闲回收定时器（60s 扫一次） */
export function startNrSweeper(): void {
  if (sweeper) return
  sweeper = setInterval(() => {
    const now = Date.now()
    for (const [key, inst] of instances.entries()) {
      if (now - inst.lastActive > IDLE_MS) killInstance(key)
    }
  }, 60_000)
  sweeper.unref()
}

export function killProjectInstance(userId: number, projectId: number): void {
  killInstance(`${userId}:${projectId}`)
}

export function killAllNrInstances(): void {
  for (const key of [...instances.keys()]) killInstance(key)
}

export function nrInstanceStats(): { count: number; max: number; keys: string[] } {
  return { count: instances.size, max: MAX_INSTANCES, keys: [...instances.keys()] }
}
