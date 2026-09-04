/**
 * 图片扩展名判定（本地落盘与 OSS objectKey 共用）。
 *
 * URL 后缀只有在命中图片白名单时才可信：部分中转渠道（如易联的 gpt-image-2）返回的
 * 结果图地址末段是 `.{64位哈希}`，直接当扩展名会让文件/对象失去 png 后缀，
 * 浏览器右键「图片另存为」就得到一个没有后缀、系统打不开的文件。
 */

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

/** 归一为可信图片扩展名（jpeg → jpg），不可信返回 null */
export function normalizeImageExt(ext: string | null | undefined): string | null {
  const value = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!IMAGE_EXTENSIONS.has(value)) return null
  return value === 'jpeg' ? 'jpg' : value
}

/** URL 路径末段的扩展名，仅在命中白名单时可用 */
export function extFromUrlPathname(pathname: string): string | null {
  const base = pathname.slice(pathname.lastIndexOf('/') + 1)
  return normalizeImageExt(base.slice(base.lastIndexOf('.') + 1))
}

/** 按文件头识别真实图片格式：中转渠道的 content-type 经常是 octet-stream 或与内容不符 */
export function extFromBytes(buffer: Buffer): string | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'gif'
  return null
}

export function extFromMime(mimeType: string): string {
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'png'
}

/** 像正常扩展名的短后缀（svg/avif/tiff 等白名单外的真实类型也在此保留，不强行改写成 png） */
const PLAUSIBLE_EXT = /^[a-z0-9]{1,5}$/

/**
 * 最终扩展名：可信白名单后缀优先，其次保留形似正常后缀的短扩展名，
 * 剩下（哈希尾巴、无后缀、content-type 乱给）才靠文件头和 MIME 兜底。
 */
export function resolveImageExt(opts: { ext?: string | null; mimeType: string; buffer?: Buffer | null }): string {
  const trusted = normalizeImageExt(opts.ext)
  if (trusted) return trusted
  const raw = (opts.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (PLAUSIBLE_EXT.test(raw)) return raw
  return (opts.buffer ? extFromBytes(opts.buffer) : null) || extFromMime(opts.mimeType)
}
