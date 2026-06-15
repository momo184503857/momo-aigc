import crypto from 'crypto'
import { config } from '../config.js'

/**
 * 用户个人 ToAPIs Key 的服务端加密存储（AES-256-GCM）。
 *
 * 密钥来源（按优先级）：
 *   1. 显式配置的 ENCRYPTION_KEY（接受 64 位 hex，或任意字符串经 SHA-256 取 32 字节）；
 *   2. 未配置时，从 JWT_SECRET 用 HKDF-SHA256 派生 32 字节兜底（保证已有部署升级不崩）。
 *
 * 注意：兜底派生意味着轮换 JWT_SECRET 或补配 ENCRYPTION_KEY 后，旧密文将无法解密，
 * 受影响用户需重新录入个人 key（表里 encryption_version 列辅助识别）。
 */

const ALGO = 'aes-256-gcm'
const VERSION = 'v1'
const IV_BYTES = 12 // GCM 推荐 96-bit IV

let cachedKey: Buffer | null = null
let warnedFallback = false

function resolveMasterKey(): Buffer {
  if (cachedKey) return cachedKey

  const configured = (config.encryptionKey || '').trim()
  if (configured) {
    if (/^[0-9a-fA-F]{64}$/.test(configured)) {
      cachedKey = Buffer.from(configured, 'hex')
    } else {
      cachedKey = crypto.createHash('sha256').update(configured).digest()
    }
    return cachedKey
  }

  // 兜底：从 JWT_SECRET 派生
  if (!warnedFallback) {
    console.warn(
      '[crypto] 未配置 ENCRYPTION_KEY，已从 JWT_SECRET 派生用户 Key 加密密钥。' +
      '为安全与稳定性建议显式配置 ENCRYPTION_KEY（64 位 hex）。'
    )
    warnedFallback = true
  }
  const ikm = crypto.createHash('sha256').update(config.jwtSecret).digest()
  const derived = crypto.hkdfSync(
    'sha256', ikm, Buffer.from('momoaigc/v1/user-key-encryption'), Buffer.alloc(0), 32
  )
  cachedKey = Buffer.from(derived)
  return cachedKey
}

export interface EncryptedKey {
  ciphertext: string // base64
  iv: string         // base64
  tag: string        // base64
  version: string
}

export function encryptKey(plain: string): EncryptedKey {
  const key = resolveMasterKey()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    version: VERSION,
  }
}

export function decryptKey(rec: { ciphertext: string; iv: string; tag: string }): string {
  const key = resolveMasterKey()
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(rec.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(rec.tag, 'base64'))
  const dec = Buffer.concat([
    decipher.update(Buffer.from(rec.ciphertext, 'base64')),
    decipher.final(),
  ])
  return dec.toString('utf8')
}

/** 生成用于展示的脱敏提示，如 sk-abcd****wxyz */
export function maskKey(plain: string): string {
  if (!plain) return ''
  if (plain.length <= 8) return '****'
  return plain.slice(0, 4) + '****' + plain.slice(-4)
}
