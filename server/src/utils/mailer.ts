import nodemailer from 'nodemailer'
import { config } from '../config.js'

type CodePurpose = 'register' | 'login' | 'reset_password'

const purposeSubject: Record<CodePurpose, string> = {
  register: '【墨墨AI生图】注册验证码',
  login: '【墨墨AI生图】登录验证码',
  reset_password: '【墨墨AI生图】重置密码验证码',
}

let transporter: nodemailer.Transporter | null | undefined

/**
 * 创建（惰性单例）nodemailer transporter。
 * SMTP_HOST 为空时返回 null，表示走控制台降级模式。
 */
function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) return transporter
  const { host, port, secure, user, pass } = config.smtp
  if (!host) {
    transporter = null
    return null
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  })
  return transporter
}

function htmlBody(code: string, purpose: CodePurpose): string {
  const action =
    purpose === 'register' ? '注册账号' : purpose === 'login' ? '登录' : '重置密码'
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#1890ff;margin:0 0 16px;">墨墨 AI 生图</h2>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        你正在进行<strong>${action}</strong>操作，验证码为：
      </p>
      <div style="margin:16px 0;text-align:center;">
        <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:8px;color:#1890ff;background:#f0f7ff;padding:12px 24px;border-radius:8px;">${code}</span>
      </div>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        验证码 ${config.codeTtlMinutes} 分钟内有效，请勿泄露给他人。
      </p>
      <p style="font-size:12px;color:#999;margin-top:24px;">
        若非本人操作，请忽略此邮件。
      </p>
    </div>
  `
}

/**
 * 发送验证码邮件。SMTP 未配置时降级为控制台打印（开发模式）。
 * 抛错表示发送失败，由调用方处理。
 */
export async function sendVerificationCode(
  email: string,
  code: string,
  purpose: CodePurpose,
): Promise<void> {
  const tp = getTransporter()

  // 降级模式：SMTP 未配置，打印到控制台
  if (!tp) {
    console.log(`[验证码-开发降级] email=${email} code=${code} purpose=${purpose}`)
    return
  }

  const from = config.smtp.from || config.smtp.user
  await tp.sendMail({
    from,
    to: email,
    subject: purposeSubject[purpose],
    html: htmlBody(code, purpose),
  })
}
