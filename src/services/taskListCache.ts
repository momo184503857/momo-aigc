export type TaskListCacheNamespace = 'panel' | 'results'

export const TASK_LIST_CACHE_FRESH_MS = 60_000
export const TASK_LIST_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const TASK_LIST_CACHE_MAX_CHARS = 1_000_000

const CACHE_VERSION = 1
const CACHE_PREFIX = 'momo_task_list_cache_v1'

export interface CachedTaskRecord {
  id: number
  user_id?: number
  toapis_task_id?: string
  client_business_id?: string | null
  model: string
  prompt: string
  prompt_truncated?: boolean
  size?: string
  resolution: string
  aspectRatio: string
  n?: number
  template_image_ids: number[]
  input_image_urls: string[]
  result_image_urls: string[]
  status: string
  progress: number
  error_code?: string | null
  error_message: string
  created_at: string
  updated_at?: string
  completed_at: string | null
  expires_at?: string | null
  feature_id?: string
  points_cost?: number
  points_balance_after?: number
  suiteId?: number | null
  pointIndex?: number | null
  task_no?: string
  logical_model_id?: number | null
  remark?: string
}

interface CacheEnvelope {
  version: number
  namespace: TaskListCacheNamespace
  userId: number
  savedAt: number
  total: number
  records: CachedTaskRecord[]
}

export interface TaskListCacheHit {
  records: CachedTaskRecord[]
  total: number
  savedAt: number
  freshness: 'fresh' | 'stale'
}

export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserStorage(): StorageLike | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}

function cacheKey(namespace: TaskListCacheNamespace, userId: number): string {
  return `${CACHE_PREFIX}:${namespace}:${userId}`
}

function stringValue(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback
}

function optionalString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function persistentUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  if (value.startsWith('/api/files/')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function urlArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(persistentUrl).slice(0, 20) : []
}

/** Whitelist-only conversion. Detail-only and binary fields are never copied. */
export function toCachedTaskRecord(value: unknown): CachedTaskRecord | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  const id = Number(item.id)
  if (!Number.isSafeInteger(id) || id <= 0) return undefined
  const model = stringValue(item.model, 200)
  const resolution = stringValue(item.resolution, 40)
  const aspectRatio = stringValue(item.aspectRatio ?? item.aspect_ratio, 40)
  const status = stringValue(item.status, 40)
  const createdAt = stringValue(item.created_at, 80)
  if (!model || !resolution || !aspectRatio || !status || !createdAt) return undefined
  const templateIds = Array.isArray(item.template_image_ids)
    ? item.template_image_ids.map(Number).filter(Number.isSafeInteger).slice(0, 100)
    : []
  return {
    id,
    user_id: optionalNumber(item.user_id),
    toapis_task_id: optionalString(item.toapis_task_id, 200),
    client_business_id: item.client_business_id === null ? null : optionalString(item.client_business_id, 200),
    model,
    prompt: stringValue(item.prompt, 500),
    prompt_truncated: Boolean(item.prompt_truncated),
    size: optionalString(item.size, 40),
    resolution,
    aspectRatio,
    n: optionalNumber(item.n),
    template_image_ids: templateIds,
    input_image_urls: urlArray(item.input_image_urls),
    result_image_urls: urlArray(item.result_image_urls),
    status,
    progress: Math.max(0, Math.min(100, optionalNumber(item.progress) ?? 0)),
    error_code: item.error_code === null ? null : optionalString(item.error_code, 100),
    error_message: stringValue(item.error_message, 500),
    created_at: createdAt,
    updated_at: optionalString(item.updated_at, 80),
    completed_at: item.completed_at === null ? null : optionalString(item.completed_at, 80) ?? null,
    expires_at: item.expires_at === null ? null : optionalString(item.expires_at, 80),
    feature_id: optionalString(item.feature_id, 100),
    points_cost: optionalNumber(item.points_cost),
    points_balance_after: optionalNumber(item.points_balance_after),
    suiteId: item.suiteId === null ? null : optionalNumber(item.suiteId),
    pointIndex: item.pointIndex === null ? null : optionalNumber(item.pointIndex),
    task_no: optionalString(item.task_no, 200),
    logical_model_id: item.logical_model_id === null ? null : optionalNumber(item.logical_model_id),
    remark: optionalString(item.remark, 200),
  }
}

export function writeTaskListCache(
  namespace: TaskListCacheNamespace,
  userId: number,
  records: unknown[],
  total: number,
  options: { storage?: StorageLike; now?: number } = {},
): boolean {
  const storage = options.storage ?? browserStorage()
  if (!storage || !Number.isSafeInteger(userId) || userId <= 0) return false
  const safeRecords = records.map(toCachedTaskRecord).filter((item): item is CachedTaskRecord => Boolean(item))
  const envelope: CacheEnvelope = {
    version: CACHE_VERSION,
    namespace,
    userId,
    savedAt: options.now ?? Date.now(),
    total: Math.max(0, Math.floor(Number(total) || 0)),
    records: safeRecords,
  }
  const key = cacheKey(namespace, userId)
  try {
    const serialized = JSON.stringify(envelope)
    if (serialized.length > TASK_LIST_CACHE_MAX_CHARS) { storage.removeItem(key); return false }
    storage.setItem(key, serialized)
    return true
  } catch {
    try { storage.removeItem(key) } catch { /* unavailable storage stays a no-op */ }
    return false
  }
}

export function readTaskListCache(
  namespace: TaskListCacheNamespace,
  userId: number,
  options: { storage?: StorageLike; now?: number } = {},
): TaskListCacheHit | undefined {
  const storage = options.storage ?? browserStorage()
  if (!storage || !Number.isSafeInteger(userId) || userId <= 0) return undefined
  const key = cacheKey(namespace, userId)
  const now = options.now ?? Date.now()
  try {
    const raw = storage.getItem(key)
    if (!raw || raw.length > TASK_LIST_CACHE_MAX_CHARS) { if (raw) storage.removeItem(key); return undefined }
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope>
    if (parsed.version !== CACHE_VERSION || parsed.namespace !== namespace || parsed.userId !== userId
      || !Number.isFinite(parsed.savedAt) || !Array.isArray(parsed.records)
      || parsed.savedAt! > now + 5 * 60_000) {
      storage.removeItem(key); return undefined
    }
    const age = Math.max(0, now - parsed.savedAt!)
    if (age > TASK_LIST_CACHE_MAX_AGE_MS) { storage.removeItem(key); return undefined }
    const records = parsed.records.map(toCachedTaskRecord).filter((item): item is CachedTaskRecord => Boolean(item))
    return {
      records,
      total: Math.max(0, Math.floor(Number(parsed.total) || 0)),
      savedAt: parsed.savedAt!,
      freshness: age <= TASK_LIST_CACHE_FRESH_MS ? 'fresh' : 'stale',
    }
  } catch {
    try { storage.removeItem(key) } catch { /* unavailable storage stays a no-op */ }
    return undefined
  }
}

export function clearTaskListCaches(storage: StorageLike | undefined = browserStorage()): void {
  if (!storage) return
  try {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(`${CACHE_PREFIX}:`)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch { /* unavailable storage stays a no-op */ }
}
