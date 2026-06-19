/**
 * 时间显示统一转北京时间（UTC+8）。
 *
 * 后端所有时间戳都以 UTC 存储（SQLite `CURRENT_TIMESTAMP` = 'YYYY-MM-DD HH:MM:SS'，
 * 或 JS `new Date().toISOString()` = ISO '...Z'）。这里在展示前统一 +8 小时再格式化，
 * 避免各处 `.slice(0, N)` 原样截断导致显示比北京时间晚 8 小时。
 */

const BJ_OFFSET_MS = 8 * 60 * 60 * 1000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 把 DB 时间串解析为 UTC 毫秒。
 * 兼容 SQLite 的 'YYYY-MM-DD HH:MM:SS'（补 'T' + 'Z' 当作 UTC）和 ISO '...Z'。
 * null / 空串 / 无效返回 NaN。
 */
export function parseUTC(s: string | null | undefined): number {
  if (!s) return NaN
  let t = s
  if (!t.endsWith('Z') && !t.includes('+') && !t.includes('T')) {
    t = t.replace(' ', 'T') + 'Z'
  }
  return new Date(t).getTime()
}

/** 内部：用一个 UTC 毫秒值按精度格式化为北京时间串。 */
function formatBJ(ms: number, withTime: 'date' | 'minute' | 'second'): string {
  const d = new Date(ms + BJ_OFFSET_MS)
  const y = d.getUTCFullYear()
  const mo = pad(d.getUTCMonth() + 1)
  const day = pad(d.getUTCDate())
  if (withTime === 'date') return `${y}-${mo}-${day}`
  const h = pad(d.getUTCHours())
  const mi = pad(d.getUTCMinutes())
  if (withTime === 'minute') return `${y}-${mo}-${day} ${h}:${mi}`
  return `${y}-${mo}-${day} ${h}:${mi}:${pad(d.getUTCSeconds())}`
}

const FALLBACK = '-'

/** DB 时间串 → 北京时间 `YYYY-MM-DD HH:MM`；null / 无效返回 `-`。 */
export function toBJMinute(s: string | null | undefined): string {
  const ms = parseUTC(s)
  return isNaN(ms) ? FALLBACK : formatBJ(ms, 'minute')
}

/** DB 时间串 → 北京时间 `YYYY-MM-DD HH:MM:SS`；null / 无效返回 `-`。 */
export function toBJSecond(s: string | null | undefined): string {
  const ms = parseUTC(s)
  return isNaN(ms) ? FALLBACK : formatBJ(ms, 'second')
}

/** DB 时间串 → 北京日期 `YYYY-MM-DD`；null / 无效返回 `-`。 */
export function toBJDate(s: string | null | undefined): string {
  const ms = parseUTC(s)
  return isNaN(ms) ? FALLBACK : formatBJ(ms, 'date')
}

/** 数字时间戳（毫秒）→ 北京时间 `YYYY-MM-DD HH:MM`；0 / 无效返回 `-`。 */
export function toBJMinuteFromMs(ms: number | null | undefined): string {
  if (!ms || isNaN(ms)) return FALLBACK
  return formatBJ(ms, 'minute')
}
