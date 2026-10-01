import type { NextFunction, Response } from 'express'
import type { AuthRequest } from './auth.js'

type Bucket = { startedAt: number; count: number; touchedAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = 0

function cleanup(now: number, windowMs: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && buckets.size <= MAX_BUCKETS) return
  lastCleanup = now
  const staleBefore = now - Math.max(windowMs * 2, CLEANUP_INTERVAL_MS * 2)
  for (const [key, bucket] of buckets) {
    if (bucket.touchedAt < staleBefore) buckets.delete(key)
  }
  if (buckets.size <= MAX_BUCKETS) return
  const oldest = [...buckets.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)
  for (const [key] of oldest.slice(0, buckets.size - MAX_BUCKETS)) buckets.delete(key)
}

export function userRateLimit(name: string, limit: number, windowMs = 60_000) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userId = req.user?.userId
    if (!userId) { next(); return }
    const now = Date.now()
    cleanup(now, windowMs)
    const key = `${name}:${userId}`
    let bucket = buckets.get(key)
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0, touchedAt: now }
      buckets.set(key, bucket)
    }
    bucket.touchedAt = now
    bucket.count++
    if (bucket.count <= limit) { next(); return }
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000))
    res.setHeader('Retry-After', String(retryAfterSeconds))
    res.status(429).json({
      success: false,
      error: '请求过于频繁，请稍后重试',
      retryAfterSeconds,
    })
  }
}

/** Test-only reset; production code never needs to mutate limiter state. */
export function resetUserRateLimits(): void {
  buckets.clear()
  lastCleanup = 0
}
