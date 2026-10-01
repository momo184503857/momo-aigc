export type SupplementaryImageRecord = { name: string; url: string }

const MAX_URL_LENGTH = 4096
const MAX_SUPPLEMENTARY_IMAGES = 50
const MAX_SUPPLEMENTARY_NAME_LENGTH = 50

export class TaskSubmissionValidationError extends Error {}

export function isPersistentImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return false
  if (value.startsWith('/api/files/')) return !value.includes('..') && !value.includes('\\')
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

export function validateReferenceImageUrls(value: unknown, maxImages: number): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new TaskSubmissionValidationError('参考图片格式无效')
  if (value.length > maxImages) throw new TaskSubmissionValidationError(`参考图最多 ${maxImages} 张`)
  const urls = value.map((url) => {
    if (!isPersistentImageUrl(url)) {
      throw new TaskSubmissionValidationError('参考图片必须先上传完成，不能提交 Base64 或临时地址')
    }
    return url
  })
  return [...new Set(urls)]
}

export function validateSupplementaryImages(value: unknown): SupplementaryImageRecord[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new TaskSubmissionValidationError('补充图片格式无效')
  if (value.length > MAX_SUPPLEMENTARY_IMAGES) {
    throw new TaskSubmissionValidationError(`补充图片最多 ${MAX_SUPPLEMENTARY_IMAGES} 项`)
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new TaskSubmissionValidationError('补充图片格式无效')
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name || name.length > MAX_SUPPLEMENTARY_NAME_LENGTH) {
      throw new TaskSubmissionValidationError(`补充图片名称长度必须为 1-${MAX_SUPPLEMENTARY_NAME_LENGTH} 字`)
    }
    if (!isPersistentImageUrl(record.url)) {
      throw new TaskSubmissionValidationError('补充图片必须先上传完成，不能提交 Base64 或临时地址')
    }
    return { name, url: record.url }
  })
}
