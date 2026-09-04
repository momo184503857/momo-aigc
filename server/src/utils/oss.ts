import crypto from 'crypto'
import { getStorageConfig, type OssSettings } from './storageConfig.js'
import { extFromUrlPathname, resolveImageExt } from './imageExt.js'

/** 签名用 OSS 参数：默认取当前存储配置（后台可改、env 兜底），测试连接时传待验证的新值 */
function ossSettings(overrides?: Partial<OssSettings>): OssSettings {
  if (overrides) return { ...getStorageConfig().oss, ...overrides }
  return getStorageConfig().oss
}

export function generateOssUploadToken(
  opts: {
    userId: number
    filename: string
    mimeType: string
    sizeBytes: number
    scope?: 'inputs' | 'templates' | 'results' | 'materials'
  },
  overrides?: Partial<OssSettings>,
) {
  const s = ossSettings(overrides)
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()
  const ext = resolveImageExt({ ext: opts.filename.split('.').pop(), mimeType: opts.mimeType })

  const scope = opts.scope || 'inputs'
  const objectKey = `${scope}/${opts.userId}/${yyyy}/${mm}/${uuid}.${ext}`
  const publicUrl = `https://${s.bucket}.${s.endpoint}/${objectKey}`

  // OSS PostObject policy expires in 1 hour
  const expiration = new Date(Date.now() + 3600 * 1000).toISOString()

  const policy = Buffer.from(
    JSON.stringify({
      expiration,
      conditions: [
        { bucket: s.bucket },
        ['starts-with', '$key', `${scope}/${opts.userId}/`],
        ['content-length-range', 1, opts.sizeBytes || 10485760],
        ['eq', '$success_action_status', '200'],
      ],
    })
  ).toString('base64')

  const signature = crypto
    .createHmac('sha1', s.accessKeySecret)
    .update(policy)
    .digest('base64')

  return {
    uploadUrl: `https://${s.bucket}.${s.endpoint}`,
    objectKey,
    publicUrl,
    ossBucket: s.bucket,
    fields: {
      policy,
      signature,
      OSSAccessKeyId: s.accessKeyId,
      key: objectKey,
      success_action_status: '200',
    },
  }
}

export function generateResultObjectKey(userId: number, sourceUrl: string): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()
  const pathname = (() => {
    try { return new URL(sourceUrl).pathname } catch { return '' }
  })()
  // 只有可信的图片后缀才进 objectKey：中转渠道常返回 `.{sha256}` 结尾的地址，
  // 直接当扩展名会让 OSS 公网地址失去 png 后缀，浏览器右键另存得到打不开的文件
  const ext = extFromUrlPathname(pathname) || 'png'
  return `results/${userId}/${yyyy}/${mm}/${uuid}.${ext}`
}

export function getOssPublicUrl(objectKey: string): string {
  const s = ossSettings()
  return `https://${s.bucket}.${s.endpoint}/${objectKey}`
}

export async function importResultToOss(
  opts: {
    userId: number
    taskId: string
    sourceUrl: string
    targetObjectKey?: string
  },
  overrides?: Partial<OssSettings>,
): Promise<{
  objectKey: string
  publicUrl: string
  contentType?: string
  sizeBytes?: number
  sourceConnectedMs?: number
  totalMs?: number
}> {
  const s = ossSettings(overrides)
  if (!s.resultImportWorkerUrl) {
    throw new Error('OSS_RESULT_IMPORT_WORKER_URL is not configured')
  }

  const targetObjectKey = opts.targetObjectKey || generateResultObjectKey(opts.userId, opts.sourceUrl)
  const resp = await fetch(s.resultImportWorkerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(125000),
    body: JSON.stringify({
      taskId: opts.taskId,
      userId: opts.userId,
      sourceUrl: opts.sourceUrl,
      targetObjectKey,
    }),
  })

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.success === false) {
    throw new Error(data.error || `Result import failed (${resp.status})`)
  }

  return {
    objectKey: data.objectKey || targetObjectKey,
    publicUrl: data.publicUrl || `https://${s.bucket}.${s.endpoint}/${targetObjectKey}`,
    contentType: data.contentType,
    sizeBytes: data.sizeBytes,
    sourceConnectedMs: data.sourceConnectedMs,
    totalMs: data.totalMs,
  }
}

// Server-side upload to OSS via presigned PUT URL
export async function uploadToOss(
  buffer: Buffer,
  objectKey: string,
  mimeType: string,
  overrides?: Partial<OssSettings>,
): Promise<string> {
  const { bucket, endpoint, accessKeyId, accessKeySecret } = ossSettings(overrides)
  const host = `${bucket}.${endpoint}`
  const expires = Math.floor(Date.now() / 1000) + 3600 // 1 hour

  const stringToSign = `PUT\n\n${mimeType}\n${expires}\n/${bucket}/${objectKey}`

  const signature = crypto
    .createHmac('sha1', accessKeySecret)
    .update(stringToSign)
    .digest('base64')

  const encodedSig = encodeURIComponent(signature)

  const url = `https://${host}/${objectKey}?OSSAccessKeyId=${accessKeyId}&Expires=${expires}&Signature=${encodedSig}`

  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: buffer,
  })

  if (resp.status !== 200) {
    const text = await resp.text()
    throw new Error(`OSS upload failed: HTTP ${resp.status} - ${text}`)
  }

  return `https://${host}/${objectKey}`
}

/** 签名 DELETE（存储配置「测试连接」清理测试对象用） */
export async function deleteFromOss(objectKey: string, overrides?: Partial<OssSettings>): Promise<void> {
  const { bucket, endpoint, accessKeyId, accessKeySecret } = ossSettings(overrides)
  const host = `${bucket}.${endpoint}`
  const expires = Math.floor(Date.now() / 1000) + 600

  const stringToSign = `DELETE\n\n\n${expires}\n/${bucket}/${objectKey}`
  const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64')
  const url = `https://${host}/${objectKey}?OSSAccessKeyId=${accessKeyId}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`

  const resp = await fetch(url, { method: 'DELETE' })
  // 204 成功；404 视为已删除（幂等）
  if (resp.status !== 204 && resp.status !== 404 && resp.status !== 200) {
    const text = await resp.text()
    throw new Error(`OSS delete failed: HTTP ${resp.status} - ${text}`)
  }
}
