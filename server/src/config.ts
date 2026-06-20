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

  // 可用 MOMO_DB_PATH 指向其它库（备份/测试/运维用）；默认项目内 data/momo.db
  dbPath: process.env.MOMO_DB_PATH
    ? path.resolve(process.env.MOMO_DB_PATH)
    : path.resolve(__dirname, '../data/momo.db'),
}
