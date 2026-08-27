import { db } from '../db/index.js'
import { config } from '../config.js'

/**
 * 存储双模式配置：direct（直接传，图片存本机磁盘、参考图直传渠道）/ oss（阿里云 OSS）。
 *
 * 优先级：system_config.storage_config（管理员后台保存，JSON）> .env 兜底（仅预填 oss 子配置）。
 * 默认一律 direct（无任何配置时开源用户零 OSS 可用）。
 * 短缓存让高频读取（上传/转存）不必每次查库，同时后台保存后免重启几秒内生效。
 */

export type StorageMode = 'direct' | 'oss'

export interface OssSettings {
  endpoint: string
  bucket: string
  accessKeyId: string
  accessKeySecret: string
  resultImportWorkerUrl: string
}

export interface StorageConfig {
  mode: StorageMode
  oss: OssSettings
}

export const STORAGE_CONFIG_KEY = 'storage_config'

/** .env 的 OSS 变量仅作为后台表单的兜底预填值，不决定模式 */
function envOssDefaults(): OssSettings {
  return {
    endpoint: config.oss.endpoint,
    bucket: config.oss.bucket,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    resultImportWorkerUrl: config.oss.resultImportWorkerUrl,
  }
}

let cache: { at: number; value: StorageConfig } | null = null
const CACHE_TTL_MS = 3_000

export function getStorageConfig(): StorageConfig {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  const merged: StorageConfig = { mode: 'direct', oss: envOssDefaults() }
  try {
    const row = db.prepare(`SELECT value FROM system_config WHERE key = ?`).get(STORAGE_CONFIG_KEY) as any
    if (row?.value) {
      const saved = JSON.parse(row.value)
      if (saved && typeof saved === 'object') {
        if (saved.mode === 'oss' || saved.mode === 'direct') merged.mode = saved.mode
        if (saved.oss && typeof saved.oss === 'object') {
          for (const key of Object.keys(merged.oss) as (keyof OssSettings)[]) {
            const v = saved.oss[key]
            if (typeof v === 'string') merged.oss[key] = v
          }
        }
      }
    }
  } catch (e) {
    console.warn('[storageConfig] 解析 storage_config 失败，使用默认配置：', (e as Error).message)
  }
  cache = { at: Date.now(), value: merged }
  return merged
}

export function isDirectMode(): boolean {
  return getStorageConfig().mode === 'direct'
}

/** OSS 模式可用性：bucket 与两把密钥齐备 */
export function ossSettingsComplete(oss: OssSettings): boolean {
  return !!(oss.bucket && oss.accessKeyId && oss.accessKeySecret)
}

/** 后台保存：整包校验 + upsert；undefined 字段保留旧值，字符串（含空串）覆盖 */
export function saveStorageConfig(input: {
  mode?: unknown
  oss?: Partial<Record<keyof OssSettings, unknown>>
}): StorageConfig {
  const mode = input.mode === 'oss' || input.mode === 'direct' ? input.mode : undefined

  const current = getStorageConfig()
  const next: StorageConfig = {
    mode: mode ?? current.mode,
    oss: { ...current.oss },
  }
  if (input.oss && typeof input.oss === 'object') {
    for (const key of Object.keys(next.oss) as (keyof OssSettings)[]) {
      const v = input.oss[key]
      if (typeof v === 'string') next.oss[key] = v
    }
  }
  if (next.mode === 'oss' && !ossSettingsComplete(next.oss)) {
    throw new Error('OSS 模式需要完整的 Bucket 与 AccessKey 配置（endpoint / bucket / accessKeyId / accessKeySecret）')
  }

  const value = JSON.stringify(next)
  db.prepare(`INSERT INTO system_config (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(STORAGE_CONFIG_KEY, value)
  cache = null
  return next
}
