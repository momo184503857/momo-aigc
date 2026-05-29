import { Router } from 'express'
import { db } from '../db/index.js'
import { comparePassword, hashPassword } from '../utils/password.js'
import { signToken } from '../utils/jwt.js'

export const authRouter = Router()

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    res.status(400).json({ success: false, error: '请输入用户名和密码' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any

  if (!user) {
    res.status(401).json({ success: false, error: '账号或密码错误' })
    return
  }

  if (user.status === 'disabled') {
    res.status(403).json({ success: false, error: '账号已被禁用，请联系管理员' })
    return
  }

  if (!comparePassword(password, user.password_hash)) {
    res.status(401).json({ success: false, error: '账号或密码错误' })
    return
  }

  // Update last login time
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)

  const token = signToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  })

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        points: user.points || 0,
      },
    },
  })
})

authRouter.post('/logout', (_req, res) => {
  // JWT is stateless; client-side token removal handles logout
  res.json({ success: true })
})
