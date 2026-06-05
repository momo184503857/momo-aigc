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

export async function handler(event, ...rest) {
  try {
    // FC 3.0 HTTP trigger: event is a Buffer containing the FC event envelope:
    // { version, rawPath, headers: {...}, body: "<json-string>", ... }
    let eventObj
    if (Buffer.isBuffer(event)) {
      eventObj = JSON.parse(event.toString('utf8'))
    } else if (typeof event === 'string') {
      eventObj = JSON.parse(event)
    } else {
      eventObj = event || {}
    }

    // The actual request body is a JSON string inside eventObj.body
    const payload = typeof eventObj.body === 'string'
      ? JSON.parse(eventObj.body)
      : eventObj.body || eventObj

    const result = await importResult(payload)
    return json(200, result)
  } catch (err) {
    return json(err.statusCode || 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export default handler
