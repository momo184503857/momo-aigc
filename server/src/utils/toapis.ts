import { db } from '../db/index.js'

const BASE_URL = 'https://toapis.com'

export function getKey(): string {
  const row = db.prepare(`SELECT value FROM system_config WHERE key = 'toapis_api_key'`).get() as { value: string } | undefined
  return row?.value || ''
}

export function getKeyMode(): string {
  const row = db.prepare(`SELECT value FROM system_config WHERE key = 'key_mode'`).get() as { value: string } | undefined
  return row?.value || 'user'
}

export async function uploadImage(buffer: Buffer, filename: string, mime: string): Promise<string> {
  const apiKey = getKey()
  if (!apiKey) throw new Error('Shared API Key not configured')

  const formData = new FormData()
  formData.append('file', new Blob([buffer], { type: mime }), filename)

  const res = await fetch(`${BASE_URL}/v1/uploads/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || err.error?.message || `Upload failed (${res.status})`)
  }

  const data = await res.json()
  if (!data.success || !data.data?.url) {
    throw new Error('Upload response missing image URL')
  }

  return data.data.url
}

export async function createTask(body: Record<string, unknown>): Promise<string> {
  const apiKey = getKey()
  if (!apiKey) throw new Error('Shared API Key not configured')

  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message || data.error?.message || `Create task failed (${res.status})`)
  }

  if (!data.id) {
    throw new Error('Create task response missing task ID')
  }

  return data.id
}

export async function getTaskStatus(taskId: string): Promise<{
  status: string
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  expiresAt?: string
}> {
  const apiKey = getKey()
  if (!apiKey) throw new Error('Shared API Key not configured')

  const res = await fetch(`${BASE_URL}/v1/images/generations/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error?.message || `Status query failed (${res.status})`)
  }

  return {
    status: data.status,
    progress: data.progress ?? 0,
    resultUrls: (data.result?.data || []).map((img: { url: string }) => img.url),
    expiresAt: data.expires_at,
    errorMessage: data.error?.message,
    errorCode: data.error?.code,
  }
}

export async function testConnection(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return res.ok
  } catch {
    return false
  }
}
