import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  jwtExpiresIn: '7d',

  // 用户个人 ToAPIs Key 加密密钥（64 位 hex；缺失时从 JWT_SECRET 派生兜底）
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  // OSS
  oss: {
    endpoint: process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com',
    bucket: process.env.OSS_BUCKET || '',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    resultImportWorkerUrl: process.env.OSS_RESULT_IMPORT_WORKER_URL || '',
    resultImportWorkerSecret: process.env.OSS_RESULT_IMPORT_WORKER_SECRET || '',
  },

  // Email SMTP（验证码邮件发信通道）
  // 阿里云 DirectMail: host=smtpdm.aliyun.com port=465 secure=true
  // 留空 SMTP_HOST 则验证码打印到服务端控制台（开发降级模式）
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },
  // 验证码有效期（分钟）与同邮箱同用途重发间隔（秒）
  codeTtlMinutes: 10,
  codeResendSeconds: 60,

  // 可用 MOMO_DB_PATH 指向其它库（备份/测试/运维用）；默认项目内 data/momo.db
  dbPath: process.env.MOMO_DB_PATH
    ? path.resolve(process.env.MOMO_DB_PATH)
    : path.resolve(__dirname, '../data/momo.db'),
}
