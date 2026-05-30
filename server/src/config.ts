import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  jwtExpiresIn: '7d',

  // OSS
  oss: {
    endpoint: process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com',
    bucket: process.env.OSS_BUCKET || '',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    resultImportWorkerUrl: process.env.OSS_RESULT_IMPORT_WORKER_URL || '',
    resultImportWorkerSecret: process.env.OSS_RESULT_IMPORT_WORKER_SECRET || '',
  },

  dbPath: path.resolve(__dirname, '../data/momo.db'),
}
