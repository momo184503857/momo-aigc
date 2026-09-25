import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { Router } from 'express'

export const THUMBNAIL_VERSION = 'v1'
export const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const MAX_PIXELS = 40_000_000
const MAX_BYTES = 50 * 1024 * 1024

class ThumbnailError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** 固定规格、只读本地原图。不解析远程 URL，不跟随上传目录外的软链接。 */
export function createThumbnailService(uploadsRoot: string, cacheRoot: string) {
  const pending = new Map<string, Promise<string>>()
  let active = 0
  const waiters: (() => void)[] = []
  async function acquire() {
    if (active < 2) { active++; return }
    if (waiters.length >= 32) throw new ThumbnailError(503, '缩略图服务繁忙，请稍后重试')
    await new Promise<void>(resolve => waiters.push(resolve))
  }
  function release() {
    const next = waiters.shift()
    if (next) next()
    else active--
  }
  function validate(key: string) {
    const parts = key.split('/')
    if (!['inputs', 'templates', 'results', 'materials'].includes(parts[0] || '') ||
        parts.length < 2 || parts.some(p => !p || p.startsWith('.') || /[\\\x00-\x1f\x7f:%?#]/.test(p))) {
      throw new ThumbnailError(400, '无效的图片路径')
    }
  }
  async function generate(key: string): Promise<string> {
    await acquire()
    let temp: string | undefined
    try {
      const root = await fs.realpath(uploadsRoot)
      const source = await fs.realpath(path.join(root, key))
      if (!source.startsWith(root + path.sep)) throw new ThumbnailError(400, '无效的图片路径')
      const stat = await fs.stat(source)
      if (!stat.isFile()) throw new ThumbnailError(404, '图片不存在')
      if (stat.size > MAX_BYTES) throw new ThumbnailError(422, '图片超出缩略图处理限制')
      const digest = crypto.createHash('sha256').update(key).digest('hex')
      const target = path.join(cacheRoot, THUMBNAIL_VERSION, digest.slice(0, 2), `${digest}.webp`)
      try { await fs.access(target); return target } catch { /* 首次生成 */ }
      await fs.mkdir(path.dirname(target), { recursive: true })
      temp = `${target}.${crypto.randomUUID()}.tmp`
      // animated=false/pages=1：动图仅取首帧，原图不改变。
      await sharp(source, { limitInputPixels: MAX_PIXELS, animated: false, pages: 1 })
        .rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 }).toFile(temp)
      await fs.rename(temp, target)
      return target
    } finally {
      if (temp) await fs.rm(temp, { force: true }).catch(() => {})
      release()
    }
  }
  return {
    get(key: string): Promise<string> {
      validate(key)
      const existing = pending.get(key)
      if (existing) return existing
      const promise = generate(key).finally(() => pending.delete(key))
      pending.set(key, promise)
      return promise
    },
  }
}

/** 与现有 /api/files 公共读取边界一致；只能生成固定 400px 规格。 */
export function createThumbnailRouter(uploadsRoot: string, cacheRoot: string) {
  const router = Router()
  const service = createThumbnailService(uploadsRoot, cacheRoot)
  router.get<Record<string, string>>(`/${THUMBNAIL_VERSION}/*`, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      if (Object.keys(req.query).length) throw new ThumbnailError(400, '不支持自定义缩略图参数')
      const file = await service.get(req.params[0] || '')
      res.type('webp').set('Cache-Control', IMAGE_CACHE_CONTROL)
      res.sendFile(file, err => {
        if (err && !res.headersSent) res.set('Cache-Control', 'no-store').status(404).end()
      })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const status = error instanceof ThumbnailError ? error.status : code === 'ENOENT' ? 404 : 422
      res.status(status).json({ success: false, error: status === 404 ? '图片不存在' : status === 503 ? '缩略图服务繁忙，请稍后重试' : '无法生成缩略图' })
    }
  })
  router.use((_req, res) => { res.set('Cache-Control', 'no-store').status(404).end() })
  // malformed URL encoding errors must not become cacheable HTML errors.
  router.use((err: unknown, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) => {
    res.set('Cache-Control', 'no-store').status(err instanceof URIError ? 400 : 500).end()
  })
  return router
}
