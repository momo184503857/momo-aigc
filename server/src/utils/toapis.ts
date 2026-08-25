import { db } from '../db/index.js'

const BASE_URL = 'https://toapis.xyz'

export function getKey(): string {
  const row = db.prepare(`SELECT value FROM system_config WHERE key = 'toapis_api_key'`).get() as { value: string } | undefined
  return row?.value || ''
}

// 旧 resolveUserApiKey / uploadImage / createTask / getTaskStatus 已随 fixed-channels
// 重构退役（个人 Key 与直连 toapis 链路下线，生图统一走 /api/generations 编排）。

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
