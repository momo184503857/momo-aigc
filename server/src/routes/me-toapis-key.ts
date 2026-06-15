import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getKey, testConnection, getBalance } from '../utils/toapis.js'
import { encryptKey, decryptKey, maskKey } from '../utils/crypto.js'

export const meToapisKeyRouter = Router()

meToapisKeyRouter.use(authMiddleware)

interface UserKeyRow {
  encrypted_key: string
  key_iv: string
  key_tag: string
  key_hint: string
  use_personal_key: number
  encryption_version: string
}

function getUserKey(userId: number): UserKeyRow | undefined {
  return db.prepare(
    `SELECT encrypted_key, key_iv, key_tag, key_hint, use_personal_key, encryption_version
     FROM user_toapis_keys WHERE user_id = ?`
  ).get(userId) as UserKeyRow | undefined
}

// 当前用户的 key 配置概览（不含明文 key）
meToapisKeyRouter.get('/key-config', (req: AuthRequest, res) => {
  const row = getUserKey(req.user!.userId)
  const hasPersonalKey = !!row
  res.json({
    success: true,
    data: {
      hasPersonalKey,
      keyHint: row?.key_hint || '',
      usePersonalKey: hasPersonalKey && row!.use_personal_key === 1,
      sharedKeyConfigured: !!getKey(),
    },
  })
})

// 保存/更新个人 key（加密存储；不自动切换模式，尊重用户自由选择）
meToapisKeyRouter.put('/key', (req: AuthRequest, res) => {
  const { apiKey } = req.body
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    res.status(400).json({ success: false, error: '请输入 API Key' })
    return
  }

  const plain = apiKey.trim()
  const enc = encryptKey(plain)
  const hint = maskKey(plain)
  const userId = req.user!.userId

  db.prepare(`
    INSERT INTO user_toapis_keys (user_id, encrypted_key, key_iv, key_tag, key_hint, use_personal_key, encryption_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT use_personal_key FROM user_toapis_keys WHERE user_id = ?), 0), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_key = excluded.encrypted_key,
      key_iv = excluded.key_iv,
      key_tag = excluded.key_tag,
      key_hint = excluded.key_hint,
      encryption_version = excluded.encryption_version,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, enc.ciphertext, enc.iv, enc.tag, hint, userId, enc.version)

  res.json({
    success: true,
    data: {
      hasPersonalKey: true,
      keyHint: hint,
      sharedKeyConfigured: !!getKey(),
    },
  })
})

// 切换当前使用的 key 模式（共享 / 个人）
meToapisKeyRouter.patch('/key-mode', (req: AuthRequest, res) => {
  const { usePersonalKey } = req.body
  const userId = req.user!.userId
  const wantPersonal = !!usePersonalKey

  const row = getUserKey(userId)
  if (wantPersonal && !row) {
    res.status(400).json({ success: false, error: '尚未配置个人 Key，请先保存' })
    return
  }

  if (!row) {
    // 没有个人 key 行，模式只能是 shared（默认），无需写入
    res.json({ success: true, data: { usePersonalKey: false } })
    return
  }

  db.prepare(`UPDATE user_toapis_keys SET use_personal_key = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
    .run(wantPersonal ? 1 : 0, userId)

  res.json({ success: true, data: { usePersonalKey: wantPersonal } })
})

// 清空个人 key（删除整行，模式随之回退共享）
meToapisKeyRouter.delete('/key', (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM user_toapis_keys WHERE user_id = ?`).run(req.user!.userId)
  res.json({ success: true, data: { usePersonalKey: false } })
})

// 测试连接（用传入的 key，不落库）
meToapisKeyRouter.post('/test', async (req: AuthRequest, res) => {
  const { apiKey } = req.body
  if (!apiKey) {
    res.status(400).json({ success: false, error: '请输入 API Key' })
    return
  }
  try {
    const ok = await testConnection(apiKey)
    res.json({ success: true, data: { ok } })
  } catch (e: any) {
    res.json({ success: true, data: { ok: false, error: e.message } })
  }
})

// 查询当前个人 key 的 ToAPIs 余额（方便用户自查额度）
meToapisKeyRouter.get('/balance', async (req: AuthRequest, res) => {
  const row = getUserKey(req.user!.userId)
  if (!row) {
    res.status(400).json({ success: false, error: '尚未配置个人 Key' })
    return
  }
  try {
    const key = decryptKey({ ciphertext: row.encrypted_key, iv: row.key_iv, tag: row.key_tag })
    const result = await getBalance(key)
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.json({ success: false, error: e.message })
  }
})
