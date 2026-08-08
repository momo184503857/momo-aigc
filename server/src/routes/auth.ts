import { Router } from 'express'
import { db } from '../db/index.js'
import { comparePassword, hashPassword } from '../utils/password.js'
import { signToken } from '../utils/jwt.js'
import { sendCode, verifyCode, isEmail, type CodePurpose } from '../utils/email-code.js'

export const authRouter = Router()

/** 从用户记录中提取返回给前端的 user 对象 */
function publicUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    nickname: user.nickname || '',
    role: user.role,
    points: user.points || 0,
  }
}

authRouter.post('/login', (req, res) => {
  // 兼容旧字段 username；新字段为 account（邮箱或用户名均可）
  const account = req.body.account || req.body.username
  const { password } = req.body

  if (!account || !password) {
    res.status(400).json({ success: false, error: '请输入账号和密码' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(account, account) as any

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
      user: publicUser(user),
    },
  })
})

authRouter.post('/logout', (_req, res) => {
  // JWT is stateless; client-side token removal handles logout
  res.json({ success: true })
})

// 发送验证码（注册 / 登录 / 重置密码）
authRouter.post('/send-code', async (req, res) => {
  const { email, purpose } = req.body as { email?: string; purpose?: CodePurpose }

  if (!email || !purpose) {
    res.status(400).json({ success: false, error: '请提供邮箱和验证码用途' })
    return
  }

  const result = await sendCode(email, purpose)
  if (!result.ok) {
    res.status(result.status).json({ success: false, error: result.error })
    return
  }

  res.json({ success: true })
})

// 邮箱注册（验证码 + 设置密码）
authRouter.post('/register', (req, res) => {
  const { email, code, password } = req.body

  if (!email || !code || !password) {
    res.status(400).json({ success: false, error: '请填写邮箱、验证码和密码' })
    return
  }
  if (!isEmail(email)) {
    res.status(400).json({ success: false, error: '邮箱格式不正确' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ success: false, error: '密码至少6位' })
    return
  }

  // 校验验证码
  if (!verifyCode(email, code, 'register')) {
    res.status(400).json({ success: false, error: '验证码错误或已过期' })
    return
  }

  // username 用 email 兜底（满足 NOT NULL UNIQUE 约束）；nickname 取邮箱 @ 前部分
  const nickname = email.split('@')[0]
  const hash = hashPassword(password)

  // 事务内原子操作：查重 + 插入，避免竞态导致重复邮箱
  let result: { lastInsertRowid: number } | null = null
  try {
    result = db.transaction(() => {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
      if (existing) return null
      const r = db.prepare(
        'INSERT INTO users (username, password_hash, role, email, nickname) VALUES (?, ?, ?, ?, ?)'
      ).run(email, hash, 'user', email, nickname)
      return r as { lastInsertRowid: number }
    })()
  } catch (err: any) {
    // 兜底：唯一索引冲突（极小竞态窗口）
    if (String(err?.message || '').includes('UNIQUE')) {
      res.status(409).json({ success: false, error: '该邮箱已注册，请直接登录' })
      return
    }
    throw err
  }

  if (!result) {
    res.status(409).json({ success: false, error: '该邮箱已注册，请直接登录' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any

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
      user: publicUser(user),
    },
  })
})

// 验证码登录
authRouter.post('/login-code', (req, res) => {
  const { email, code } = req.body

  if (!email || !code) {
    res.status(400).json({ success: false, error: '请填写邮箱和验证码' })
    return
  }

  if (!verifyCode(email, code, 'login')) {
    res.status(400).json({ success: false, error: '验证码错误或已过期' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any
  if (!user) {
    res.status(404).json({ success: false, error: '账号不存在' })
    return
  }

  if (user.status === 'disabled') {
    res.status(403).json({ success: false, error: '账号已被禁用，请联系管理员' })
    return
  }

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
      user: publicUser(user),
    },
  })
})

// 忘记密码 / 重置密码（验证码 + 新密码）
authRouter.post('/reset-password', (req, res) => {
  const { email, code, new_password } = req.body

  if (!email || !code || !new_password) {
    res.status(400).json({ success: false, error: '请填写邮箱、验证码和新密码' })
    return
  }
  if (new_password.length < 6) {
    res.status(400).json({ success: false, error: '新密码至少6位' })
    return
  }

  if (!verifyCode(email, code, 'reset_password')) {
    res.status(400).json({ success: false, error: '验证码错误或已过期' })
    return
  }

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any
  if (!user) {
    res.status(404).json({ success: false, error: '账号不存在' })
    return
  }

  const hash = hashPassword(new_password)
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(hash, user.id)

  res.json({ success: true })
})
