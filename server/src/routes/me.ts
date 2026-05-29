import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { hashPassword, comparePassword } from '../utils/password.js'

export const meRouter = Router()

meRouter.get('/', authMiddleware, (req: AuthRequest, res) => {
  const user = db.prepare('SELECT id, points FROM users WHERE id = ?').get(req.user!.userId) as any
  res.json({
    success: true,
    data: {
      id: req.user!.userId,
      username: req.user!.username,
      role: req.user!.role,
      points: user?.points ?? 0,
    },
  })
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
