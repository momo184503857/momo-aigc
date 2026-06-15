import { db } from '../db/index.js'
import { decryptKey } from './crypto.js'

const BASE_URL = 'https://toapis.com'

export function getKey(): string {
  const row = db.prepare(`SELECT value FROM system_config WHERE key = 'toapis_api_key'`).get() as { value: string } | undefined
  return row?.value || ''
}

/**
 * 解析某用户当前应使用的 ToAPIs key。
 * - 该用户启用了个人 key（use_personal_key=1）且能解密 → 返回个人 key + mode 'personal'；
 * - 否则 → 返回共享 key + mode 'shared'（共享 key 也未配置时 key 为空串）。
 */
export interface ResolvedApiKey {
  key: string
  mode: 'personal' | 'shared'
}

export function resolveUserApiKey(userId: number): ResolvedApiKey {
  const row = db.prepare(
    `SELECT encrypted_key, key_iv, key_tag, use_personal_key FROM user_toapis_keys WHERE user_id = ?`
  ).get(userId) as
    | { encrypted_key: string; key_iv: string; key_tag: string; use_personal_key: number }
    | undefined

  if (row && row.use_personal_key === 1) {
    try {
      const key = decryptKey({ ciphertext: row.encrypted_key, iv: row.key_iv, tag: row.key_tag })
      if (key) return { key, mode: 'personal' }
    } catch (e) {
      // 解密失败（如加密密钥已轮换）→ 回退共享 key
      console.error('[toapis] decrypt personal key failed, fallback to shared:', (e as Error).message)
    }
  }

  return { key: getKey(), mode: 'shared' }
}

export async function uploadImage(buffer: Buffer, filename: string, mime: string, apiKey?: string): Promise<string> {
  const resolved = apiKey ?? getKey()
  if (!resolved) throw new Error('API Key 未配置')

  const formData = new FormData()
  formData.append('file', new Blob([buffer], { type: mime }), filename)

  const res = await fetch(`${BASE_URL}/v1/uploads/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resolved}` },
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

export async function createTask(body: Record<string, unknown>, apiKey?: string): Promise<string> {
  const resolved = apiKey ?? getKey()
  if (!resolved) throw new Error('API Key 未配置')

  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolved}`,
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

export async function getTaskStatus(taskId: string, apiKey?: string): Promise<{
  status: string
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  expiresAt?: string
}> {
  const resolved = apiKey ?? getKey()
  if (!resolved) throw new Error('API Key 未配置')

  const res = await fetch(`${BASE_URL}/v1/images/generations/${taskId}`, {
    headers: { Authorization: `Bearer ${resolved}` },
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

export async function getBalance(apiKey?: string): Promise<{ balance: number; credits: number; currency: string }> {
  const resolved = apiKey ?? getKey()
  if (!resolved) throw new Error('API Key 未配置')

  const res = await fetch(`${BASE_URL}/v1/balance`, {
    headers: { Authorization: `Bearer ${resolved}` },
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error?.message || `Balance query failed (${res.status})`)
  }

  return {
    balance: data.remain_balance ?? 0,
    credits: data.remain_credits ?? 0,
    currency: 'CNY',
  }
}

export async function getUserBalance(): Promise<{ balance: number; credits: number; currency: string }> {
  const apiKey = getKey()
  if (!apiKey) throw new Error('Shared API Key not configured')

  const res = await fetch(`${BASE_URL}/v1/user/balance`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error?.message || `User balance query failed (${res.status})`)
  }

  return {
    balance: data.remain_balance ?? 0,
    credits: data.remain_credits ?? 0,
    currency: 'CNY',
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
