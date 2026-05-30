import crypto from 'crypto'
import { config } from '../config.js'

export function generateOssUploadToken(opts: {
  userId: number
  filename: string
  mimeType: string
  sizeBytes: number
  scope?: 'inputs' | 'templates' | 'results'
}) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()
  const ext = opts.filename.split('.').pop() || 'png'

  const scope = opts.scope || 'inputs'
  const objectKey = `${scope}/${opts.userId}/${yyyy}/${mm}/${uuid}.${ext}`
  const publicUrl = `https://${config.oss.bucket}.${config.oss.endpoint}/${objectKey}`

  // OSS PostObject policy expires in 1 hour
  const expiration = new Date(Date.now() + 3600 * 1000).toISOString()

  const policy = Buffer.from(
    JSON.stringify({
      expiration,
      conditions: [
        { bucket: config.oss.bucket },
        ['starts-with', '$key', `${scope}/${opts.userId}/`],
        ['content-length-range', 1, opts.sizeBytes || 10485760],
        ['eq', '$success_action_status', '200'],
      ],
    })
  ).toString('base64')

  const signature = crypto
    .createHmac('sha1', config.oss.accessKeySecret)
    .update(policy)
    .digest('base64')

  return {
    uploadUrl: `https://${config.oss.bucket}.${config.oss.endpoint}`,
    objectKey,
    publicUrl,
    ossBucket: config.oss.bucket,
    fields: {
      policy,
      signature,
      OSSAccessKeyId: config.oss.accessKeyId,
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
  const extMatch = pathname.match(/\.([a-zA-Z0-9]+)$/)
  const ext = extMatch?.[1]?.toLowerCase() || 'png'
  return `results/${userId}/${yyyy}/${mm}/${uuid}.${ext}`
}

export function getOssPublicUrl(objectKey: string): string {
  return `https://${config.oss.bucket}.${config.oss.endpoint}/${objectKey}`
}

export async function importResultToOss(opts: {
  userId: number
  taskId: string
  sourceUrl: string
  targetObjectKey?: string
}): Promise<{
  objectKey: string
  publicUrl: string
  contentType?: string
  sizeBytes?: number
}> {
  const { resultImportWorkerUrl, resultImportWorkerSecret } = config.oss
  if (!resultImportWorkerUrl) {
    throw new Error('OSS_RESULT_IMPORT_WORKER_URL is not configured')
  }

  const targetObjectKey = opts.targetObjectKey || generateResultObjectKey(opts.userId, opts.sourceUrl)
  const resp = await fetch(resultImportWorkerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(resultImportWorkerSecret ? { Authorization: `Bearer ${resultImportWorkerSecret}` } : {}),
    },
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
    publicUrl: data.publicUrl || getOssPublicUrl(targetObjectKey),
    contentType: data.contentType,
    sizeBytes: data.sizeBytes,
  }
}

// Server-side upload to OSS via presigned PUT URL
export async function uploadToOss(
  buffer: Buffer,
  objectKey: string,
  mimeType: string
): Promise<string> {
  const { bucket, endpoint, accessKeyId, accessKeySecret } = config.oss
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
