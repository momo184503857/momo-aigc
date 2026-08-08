import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { hashPassword, comparePassword } from '../utils/password.js'
import { resolveUserApiKey } from '../utils/toapis.js'
import { fetchKeyCredits, creditsToYuan } from '../utils/credits.js'

export const meRouter = Router()

meRouter.get('/', authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare('SELECT id, username, email, nickname, points FROM users WHERE id = ?').get(req.user!.userId) as any
  res.json({
    success: true,
    data: {
      id: req.user!.userId,
      username: user?.username ?? req.user!.username,
      email: user?.email || '',
      nickname: user?.nickname || '',
      role: req.user!.role,
      points: user?.points ?? 0,
    },
  })
})

// 修改昵称
meRouter.put('/profile', authMiddleware, (req: AuthRequest, res) => {
  const { nickname } = req.body

  if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
    res.status(400).json({ success: false, error: '请输入昵称' })
    return
  }
  if (nickname.length > 32) {
    res.status(400).json({ success: false, error: '昵称最多32个字符' })
    return
  }

  db.prepare('UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(nickname.trim(), req.user!.userId)

  res.json({ success: true, data: { nickname: nickname.trim() } })
})

// Change own password
meRouter.put('/password', authMiddleware, (req: AuthRequest, res) => {
  const { old_password, new_password } = req.body

  if (!old_password || !new_password) {
    res.status(400).json({ success: false, error: '请输入旧密码和新密码' })
    return
  }

  if (new_password.length < 6) {
    res.status(400).json({ success: false, error: '新密码至少6位' })
    return
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user!.userId) as any
  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }

  if (!comparePassword(old_password, user.password_hash)) {
    res.status(400).json({ success: false, error: '旧密码不正确' })
    return
  }

  const hash = hashPassword(new_password)
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(hash, req.user!.userId)

  res.json({ success: true })
})

// 我的额度：平台新积分余额 + 最近流水 + 个人 key 新积分（占位）
meRouter.get('/quota', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId) as { points: number } | undefined
  const txns = db.prepare(
    `SELECT id, amount, balance_after, reason, note, created_at
     FROM points_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`
  ).all(userId)

  let personalKeyCredits: { credits: number | null; currency: string } | null = null
  try {
    const resolved = resolveUserApiKey(userId)
    if (resolved.mode === 'personal') {
      personalKeyCredits = await fetchKeyCredits(resolved.key)
    }
  } catch { /* ignore key balance fetch errors */ }

  const credits = user?.points ?? 0
  res.json({
    success: true,
    data: {
      platform: { credits, yuan: creditsToYuan(credits) },
      recentTransactions: txns,
      personalKeyCredits,
    },
  })
})
