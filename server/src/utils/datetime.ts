/**
 * 北京时间（UTC+8）相关的 SQL 辅助。
 *
 * 所有时间戳仍以 UTC 存储，这里只在「按北京日分桶」和「按北京日做日期范围过滤」时
 * 把 +8 小时的换算加进去。col 列名由调用方硬编码传入（非用户输入），可安全拼进 SQL。
 */

/** `DATE(col, '+8 hours')` —— 按北京日取日期，用于 SELECT / GROUP BY 的日分桶。 */
export function bjDay(col: string): string {
  return `DATE(${col}, '+8 hours')`
}

/** `strftime('%Y-%m', col, '+8 hours')` —— 按北京月分桶（'YYYY-MM'）。 */
export function bjMonth(col: string): string {
  return `strftime('%Y-%m', ${col}, '+8 hours')`
}

/** `strftime('%Y-W%W', col, '+8 hours')` —— 按北京周分桶（'YYYY-Www'，周一为周首）。
 *  用 %W（SQLite 3.43 支持）；不用 ISO 的 %G/%V（该版本不支持，会返回空）。 */
export function bjWeek(col: string): string {
  return `strftime('%Y-W%W', ${col}, '+8 hours')`
}

export interface DateRangeClause {
  /** 形如 ` AND col >= ... AND col <= ...`；无边界时为空串，可直接拼到现有 WHERE 后。 */
  clause: string
  params: string[]
}

/**
 * 构造 [start, end] 闭区间的日期范围过滤（按北京日）。
 * start/end 为前端传入的 'YYYY-MM-DD'（用户选的北京日期）。
 *
 * 采用「位移参数」法：`datetime(?, '-8 hours')` 把北京零点 / 23:59:59 换算成 UTC 瞬时，
 * 列保持裸值以便走索引（如 points_transactions 的 idx_points_txn_created）。
 */
export function bjDateRangeClause(
  col: string,
  start?: string | null,
  end?: string | null,
): DateRangeClause {
  const parts: string[] = []
  const params: string[] = []
  if (start) {
    parts.push(`${col} >= datetime(?, '-8 hours')`)
    params.push(`${start} 00:00:00`)
  }
  if (end) {
    parts.push(`${col} <= datetime(?, '-8 hours')`)
    params.push(`${end} 23:59:59`)
  }
  return { clause: parts.length ? ` AND ${parts.join(' AND ')}` : '', params }
}
