import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { getStorageConfig } from './storageConfig.js'
import { uploadToOss, importResultToOss } from './oss.js'

/**
 * 统一图片存储抽象（双模式）：
 *  - direct：写本机磁盘 server/data/uploads/，URL 为站内相对路径 /api/files/...（express.static 服务）
 *  - oss   ：走 utils/oss.ts 签名直传，URL 为 bucket 公网地址
 * 业务层只面向本模块，不感知模式差异。
 */

export type StorageScope = 'inputs' | 'templates' | 'results' | 'materials'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 本地存储根目录（server/data 已被 gitignore，密钥/图片均不入库；dist 编译后同层解析） */
export const UPLOADS_ROOT = path.resolve(__dirname, '../../data/uploads')

export const LOCAL_URL_PREFIX = '/api/files/'

export interface StoredFile {
  /** direct: /api/files/...（相对路径）；oss: https://{bucket}.{endpoint}/... */
  url: string
  objectKey: string
  /** direct 恒为 'local'；oss 为 bucket 名 */
  bucket: string
}

/** 是否为本站本地文件 URL */
export function isLocalFileUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(LOCAL_URL_PREFIX)
}

/** 已持久化的结果图 URL（OSS 公网地址或本站本地地址），展示层过滤用 */
export function isStoredUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  if (url.startsWith(LOCAL_URL_PREFIX)) return true
  try {
    return new URL(url).hostname.endsWith('.aliyuncs.com')
  } catch {
    return false
  }
}

/** /api/files/inputs/1/2026/08/x.png → inputs/1/2026/08/x.png（去查询串） */
export function localUrlToObjectKey(url: string): string {
  const raw = url.slice(LOCAL_URL_PREFIX.length).split('?')[0]
  return decodeURIComponent(raw)
}

function buildObjectKey(scope: StorageScope, userId: number, ext: string): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()
  const safeExt = (ext.replace(/[^a-zA-Z0-9]/g, '') || 'png').toLowerCase()
  return `${scope}/${userId}/${yyyy}/${mm}/${uuid}.${safeExt}`
}

function extFromMime(mimeType: string): string {
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'png'
}

/** 保存图片字节（上传/结果图 base64 落盘共用入口） */
export async function saveImage(opts: {
  scope: StorageScope
  userId: number
  buffer: Buffer
  mimeType: string
  ext?: string
}): Promise<StoredFile> {
  const cfg = getStorageConfig()
  const ext = opts.ext || extFromMime(opts.mimeType)
  const objectKey = buildObjectKey(opts.scope, opts.userId, ext)

  if (cfg.mode === 'direct') {
    const abs = path.join(UPLOADS_ROOT, objectKey)
    await fs.promises.mkdir(path.dirname(abs), { recursive: true })
    await fs.promises.writeFile(abs, opts.buffer)
    return { url: LOCAL_URL_PREFIX + objectKey, objectKey, bucket: 'local' }
  }

  const url = await uploadToOss(opts.buffer, objectKey, opts.mimeType)
  return { url, objectKey, bucket: cfg.oss.bucket }
}

/** 结果图转存：direct=服务端直接下载落盘（无需 FC Worker）；oss=经 Worker 流式转存 */
export async function importResultFromUrl(opts: {
  userId: number
  taskNo: string
  sourceUrl: string
}): Promise<{ url: string; objectKey: string }> {
  const cfg = getStorageConfig()

  if (cfg.mode === 'direct') {
    const resp = await fetch(opts.sourceUrl, { signal: AbortSignal.timeout(125_000) })
    if (!resp.ok) throw new Error(`下载结果图失败（HTTP ${resp.status}）`)
    const buffer = Buffer.from(await resp.arrayBuffer())
    if (buffer.length === 0) throw new Error('结果图内容为空')
    const mimeType = resp.headers.get('content-type')?.split(';')[0] || 'image/png'
    let ext: string | undefined
    try {
      const m = new URL(opts.sourceUrl).pathname.match(/\.([a-zA-Z0-9]+)$/)
      if (m) ext = m[1]
    } catch { /* data: 等无 pathname */ }
    const stored = await saveImage({ scope: 'results', userId: opts.userId, buffer, mimeType, ext })
    return { url: stored.url, objectKey: stored.objectKey }
  }

  const res = await importResultToOss({
    userId: opts.userId,
    taskId: opts.taskNo,
    sourceUrl: opts.sourceUrl,
  })
  return { url: res.publicUrl, objectKey: res.objectKey }
}

/** 读取本地文件为图片内容（参考图直传渠道用）；非本地 URL 或文件不存在返回 null */
export async function readLocalImage(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!isLocalFileUrl(url)) return null
  const objectKey = localUrlToObjectKey(url)
  const abs = path.resolve(UPLOADS_ROOT, objectKey)
  if (!abs.startsWith(UPLOADS_ROOT + path.sep)) return null
  try {
    const buffer = await fs.promises.readFile(abs)
    const ext = path.extname(abs).slice(1).toLowerCase()
    const mimeType = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png'
    return { buffer, mimeType }
  } catch {
    return null
  }
}
