/** 展示地址与业务原图地址分离；不依赖当前存储模式，不修改传入 URL。 */
export const OSS_THUMBNAIL_PROCESS = 'image/resize,m_lfit,w_400,h_400,limit_1/format,webp/quality,q_80'

export function thumbnailUrl(source: string | undefined, origin?: string): string | undefined {
  if (!source) return undefined
  let url: URL
  try { url = new URL(source, origin || 'http://local.invalid') } catch { return undefined }
  if (!['http:', 'https:'].includes(url.protocol)) return undefined
  const local = url.origin === (origin || 'http://local.invalid')
  if (local && url.pathname.startsWith('/api/files/')) {
    const key = url.pathname.slice('/api/files/'.length)
    try {
      const parts = decodeURIComponent(key).split('/')
      if (!['inputs', 'templates', 'results', 'materials'].includes(parts[0] || '') ||
          parts.length < 2 || parts.some(p => !p || p.startsWith('.') || /[\\\x00-\x1f\x7f:%?#]/.test(p))) return undefined
      return '/api/thumbnails/v1/' + parts.map(encodeURIComponent).join('/')
    } catch { return undefined }
  }
  // 只识别 OSS 标准公网 Bucket 域名，不把任意外链退回原图。
  if (/^[a-z0-9][a-z0-9-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(url.hostname)) {
    if (url.username || url.password || url.port || [...url.searchParams.keys()].some(k => /signature|accesskey|security-token/i.test(k))) return undefined
    url.hash = ''
    url.searchParams.set('x-oss-process', OSS_THUMBNAIL_PROCESS)
    return url.toString()
  }
  return undefined
}

const localThumbnails = new Map<string, Promise<string>>()
/** 本地 blob/data 只用于上传前展示；不改变上传 File 或业务输入 URL。 */
export function localThumbnail(source: string): Promise<string> {
  if (!/^(blob:|data:image\/)/.test(source)) return Promise.reject(new Error('仅支持本地图片'))
  const existing = localThumbnails.get(source)
  if (existing) return existing
  const promise = (async () => {
    const response = await fetch(source)
    const blobUrl = URL.createObjectURL(await response.blob())
    const bitmap = new Image()
    bitmap.src = blobUrl
    try {
      await bitmap.decode()
      const scale = Math.min(1, 400 / bitmap.width, 400 / bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法生成本地预览')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/webp', 0.8)
    } finally { URL.revokeObjectURL(blobUrl) }
  })()
  if (localThumbnails.size >= 32) localThumbnails.delete(localThumbnails.keys().next().value!)
  localThumbnails.set(source, promise)
  void promise.catch(() => { if (localThumbnails.get(source) === promise) localThumbnails.delete(source) })
  return promise
}
