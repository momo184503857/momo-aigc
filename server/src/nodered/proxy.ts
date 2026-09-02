import type { RequestHandler } from 'express'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import httpProxy from 'http-proxy'
import { ensureInstance } from './manager.js'
import { verifyToken } from '../utils/jwt.js'

/**
 * Node-RED 反向代理 + 鉴权闸门（AI画布 Pro）。
 *
 * 路径约定：/red/u/<userId>/p/<projectId>/...（与实例 httpAdminRoot 完全一致，
 * 无需改写路径，实例内部生成的资源链接天然可回环）。
 *
 * 鉴权分层：
 *  - HTTP：请求带凭证（Authorization Bearer 或 ?access_token）时校验 JWT 且
 *    userId 必须匹配路径 —— fail fast。不带凭证的请求（编辑器静态资源、
 *    comms WS 升级）透传，由实例内 adminAuth.tokens 精确比对 instanceToken 兜底
 *    （instanceToken 仅下发给项目属主的浏览器会话，跨用户必被实例拒绝）。
 *  - WS：comms 连接的 token 在建立后以 auth 包发送（Node-RED 机制），
 *    升级阶段无凭证可校验，同样依赖实例内 adminAuth。
 */

const proxy = httpProxy.createProxyServer({ ws: true })

const RED_PATH_RE = /^\/red\/u\/(\d+)\/p\/(\d+)(?:\/.*)?$/

interface RedTarget {
  userId: number
  projectId: number
}

export function parseRedPath(pathname: string): RedTarget | null {
  const m = RED_PATH_RE.exec(pathname)
  if (!m) return null
  return { userId: Number(m[1]), projectId: Number(m[2]) }
}

function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  try {
    const url = new URL(req.url || '/', 'http://internal')
    return url.searchParams.get('access_token')
  } catch {
    return null
  }
}

proxy.on('error', (err, _req, res) => {
  console.error('[nodered-proxy]', (err as Error).message)
  const target = res as unknown as {
    writeHead?: (code: number) => void
    setHeader?: (name: string, value: string) => void
    end?: (body: string) => void
    destroy?: () => void
  }
  if (target.writeHead && target.end) {
    target.writeHead(502)
    target.setHeader?.('Content-Type', 'application/json; charset=utf-8')
    target.end(JSON.stringify({ success: false, error: '画布实例不可用，请刷新页面重试' }))
  } else {
    target.destroy?.()
  }
})

/**
 * HTTP 反代。必须挂载在 express.json() 之前 —— 代理转发原始请求流，
 * 一旦被 body parser 消费，Node-RED 收到的将是空 body。
 */
export const redHttpHandler: RequestHandler = (req, res, next) => {
  const target = parseRedPath(req.path)
  if (!target) return next()

  void (async () => {
    try {
      const token = extractToken(req)
      if (token) {
        let payload
        try {
          payload = verifyToken(token)
        } catch {
          res.status(401).json({ success: false, error: '登录已过期' })
          return
        }
        if (payload.userId !== target.userId) {
          res.status(403).json({ success: false, error: '无权访问该画布实例' })
          return
        }
      }
      const inst = await ensureInstance(target.userId, target.projectId)
      proxy.web(req, res, { target: `http://127.0.0.1:${inst.port}` })
    } catch (err) {
      res.status(503).json({ success: false, error: (err as Error).message || '画布实例不可用' })
    }
  })()
}

/** WS 升级反代（编辑器 comms 实时通道），挂到主 http server 的 upgrade 事件 */
export function attachRedWsUpgrade(server: HttpServer): void {
  server.on('upgrade', (req, socket, head) => {
    let target: RedTarget | null = null
    try {
      const pathname = new URL(req.url || '/', 'http://internal').pathname
      target = parseRedPath(pathname)
    } catch {
      /* fallthrough */
    }
    if (!target) {
      // 主 server 目前只有 Node-RED 需要 WS，非 /red 前缀一律拒绝
      socket.destroy()
      return
    }
    const t = target
    void ensureInstance(t.userId, t.projectId)
      .then((inst) => {
        proxy.ws(req, socket, head, { target: `http://127.0.0.1:${inst.port}` })
      })
      .catch((err) => {
        console.error('[nodered-proxy] ws 实例不可用:', (err as Error).message)
        socket.destroy()
      })
  })
}
