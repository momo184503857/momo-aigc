import crypto from 'node:crypto'

function env(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }
}

async function readJson(event) {
  if (!event) return {}
  if (Buffer.isBuffer(event)) return JSON.parse(event.toString('utf8') || '{}')
  if (typeof event === 'string') return JSON.parse(event || '{}')
  if (typeof event.body === 'string') return JSON.parse(event.body || '{}')
  return event.body || event
}

function assertAuthorized(event) {
  const secret = process.env.OSS_RESULT_IMPORT_WORKER_SECRET
  if (!secret) return

  const headers = event?.headers || {}
  const auth = headers.authorization || headers.Authorization || ''
  if (auth !== `Bearer ${secret}`) {
    const err = new Error('Unauthorized')
    err.statusCode = 401
    throw err
  }
}

async function putOssObject(buffer, objectKey, contentType) {
  const bucket = env('OSS_BUCKET')
  const endpoint = env('OSS_ENDPOINT')
  const accessKeyId = env('OSS_ACCESS_KEY_ID')
  const accessKeySecret = env('OSS_ACCESS_KEY_SECRET')
  const host = `${bucket}.${endpoint}`
  const expires = Math.floor(Date.now() / 1000) + 3600
  const stringToSign = `PUT\n\n${contentType}\n${expires}\n/${bucket}/${objectKey}`
  const signature = crypto
    .createHmac('sha1', accessKeySecret)
    .update(stringToSign)
    .digest('base64')

  const url = `https://${host}/${objectKey}?OSSAccessKeyId=${encodeURIComponent(accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: buffer,
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`OSS PUT failed (${resp.status})${text ? `: ${text}` : ''}`)
  }

  return `https://${host}/${objectKey}`
}

async function importResult(payload) {
  const { taskId, userId, sourceUrl, targetObjectKey } = payload
  if (!taskId || !userId || !sourceUrl || !targetObjectKey) {
    throw new Error('Missing taskId, userId, sourceUrl, or targetObjectKey')
  }
  if (!String(targetObjectKey).startsWith(`results/${userId}/`)) {
    throw new Error('targetObjectKey must stay under the current user results prefix')
  }

  const sourceResp = await fetch(sourceUrl, { signal: AbortSignal.timeout(120000) })
  if (!sourceResp.ok) {
    throw new Error(`Source download failed (${sourceResp.status})`)
  }

  const contentType = sourceResp.headers.get('content-type') || 'image/png'
  const buffer = Buffer.from(await sourceResp.arrayBuffer())
  const publicUrl = await putOssObject(buffer, targetObjectKey, contentType)

  return {
    success: true,
    taskId,
    objectKey: targetObjectKey,
    publicUrl,
    contentType,
    sizeBytes: buffer.length,
  }
}

export async function handler(event) {
  try {
    assertAuthorized(event)
    const payload = await readJson(event)
    return json(200, await importResult(payload))
  } catch (err) {
    return json(err.statusCode || 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export default handler
