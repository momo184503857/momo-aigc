import crypto from 'crypto'
import { config } from '../config.js'

export function generateOssUploadToken(opts: {
  userId: number
  filename: string
  mimeType: string
  sizeBytes: number
}) {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()
  const ext = opts.filename.split('.').pop() || 'png'

  const objectKey = `templates/${opts.userId}/${yyyy}/${mm}/${uuid}.${ext}`
  const publicUrl = `https://${config.oss.bucket}.${config.oss.endpoint}/${objectKey}`

  // OSS PostObject policy expires in 1 hour
  const expiration = new Date(Date.now() + 3600 * 1000).toISOString()

  const policy = Buffer.from(
    JSON.stringify({
      expiration,
      conditions: [
        { bucket: config.oss.bucket },
        ['starts-with', '$key', `templates/${opts.userId}/`],
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
