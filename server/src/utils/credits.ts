/**
 * 新积分体系常量与换算。
 *
 * 1 新积分 = 0.035 元（人民币）。平台以「新积分」为存储与扣费主单位，
 * 「人民币（元）」作为展示副单位。
 */

export const YUAN_PER_CREDIT = 0.035
export const CREDITS_PER_YUAN = 200 / 7 // = 1 / 0.035 ≈ 28.571428571（迁移 SQL 用 200.0/7.0，此处仅作文档）

/** 新积分 → 元（保留 3 位小数；用于展示折算） */
export function creditsToYuan(credits: number): number {
  return Math.round(credits * YUAN_PER_CREDIT * 1000) / 1000
}

/**
 * 查询某 apiKey 的「积分」余额。
 *
 * 数据源：ToAPIs token-balance 接口（GET /v1/balance），取其 `credits`（remain_credits）
 * 字段作为该 Key 的「积分」（主单位/源）。展示用的「余额」= 积分 × 0.035（由调用方换算）。
 *
 * 注意：**不**使用 `remain_balance`（CNY 账户余额），**不**做 ÷0.035 反推——
 * 积分是源，余额是积分 × 0.035 的派生值。
 *
 * 失败时 credits 返回 null，调用方按「获取失败/Key 无效」处理。
 */
export async function fetchKeyCredits(
  apiKey: string
): Promise<{ credits: number | null; currency: string }> {
  try {
    const { getBalance } = await import('./toapis.js')
    const r = await getBalance(apiKey)
    return { credits: r.credits ?? 0, currency: r.currency }
  } catch {
    return { credits: null, currency: 'CNY' }
  }
}
