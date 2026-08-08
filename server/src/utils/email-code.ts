import { db } from '../db/index.js'
import { config } from '../config.js'
import { sendVerificationCode } from './mailer.js'

export type CodePurpose = 'register' | 'login' | 'reset_password'

const VALID_PURPOSES: CodePurpose[] = ['register', 'login', 'reset_password']

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** 生成 6 位随机数字验证码 */
export function generateCode(): string {
  return String(Math.floor(Math.random() * 900000) + 100000)
}

interface SendResult {
  ok: true
}

interface SendError {
  ok: false
  status: number
  error: string
}

/**
 * 发送验证码。
 * - register：邮箱已存在 -> 409
 * - login / reset_password：邮箱不存在 -> 404
 * - 同邮箱同用途 60s 内已发送 -> 429
 * 返回 { ok: true } 或 { ok: false, status, error }，不抛异常。
 */
export async function sendCode(email: string, purpose: CodePurpose): Promise<SendResult | SendError> {
  if (!isEmail(email)) {
    return { ok: false, status: 400, error: '邮箱格式不正确' }
  }
  if (!VALID_PURPOSES.includes(purpose)) {
    return { ok: false, status: 400, error: '验证码用途无效' }
  }

  // 用途语义校验：注册时邮箱不应已存在；登录/重置时邮箱必须存在
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined
  if (purpose === 'register' && user) {
    return { ok: false, status: 409, error: '该邮箱已注册，请直接登录' }
  }
  if ((purpose === 'login' || purpose === 'reset_password') && !user) {
    return { ok: false, status: 404, error: '该邮箱未注册' }
  }

  // 60s 防刷：查最近一条同邮箱同用途未消费记录
  const recent = db.prepare(`
    SELECT created_at FROM email_codes
    WHERE email = ? AND purpose = ? AND consumed = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email, purpose) as { created_at: string } | undefined

  if (recent) {
    const elapsed = (Date.now() - new Date(recent.created_at.replace(' ', 'T') + 'Z').getTime()) / 1000
    if (elapsed < config.codeResendSeconds) {
      const wait = Math.ceil(config.codeResendSeconds - elapsed)
      return { ok: false, status: 429, error: `发送过于频繁，请 ${wait} 秒后重试` }
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + config.codeTtlMinutes * 60 * 1000)
    .toISOString().replace('T', ' ').replace('Z', '')

  db.prepare(`
    INSERT INTO email_codes (email, code, purpose, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(email, code, purpose, expiresAt)

  try {
    await sendVerificationCode(email, code, purpose)
  } catch (err) {
    console.error('[email-code] 发送邮件失败:', err)
    return { ok: false, status: 500, error: '验证码发送失败，请稍后重试' }
  }

  return { ok: true }
}

/**
 * 校验验证码。匹配且未过期未消费则标记消费返回 true。
 */
export function verifyCode(email: string, code: string, purpose: CodePurpose): boolean {
  const row = db.prepare(`
    SELECT id, expires_at, consumed FROM email_codes
    WHERE email = ? AND purpose = ? AND code = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(email, purpose, code) as { id: number; expires_at: string; consumed: number } | undefined

  if (!row) return false
  if (row.consumed === 1) return false

  const expires = new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime()
  if (Date.now() > expires) return false

  db.prepare('UPDATE email_codes SET consumed = 1 WHERE id = ?').run(row.id)
  return true
}
