/**
 * 新积分体系常量与换算。
 *
 * 1 新积分 = 0.035 元（人民币）。平台以「新积分」为存储与扣费主单位，
 * 「人民币（元）」作为展示副单位。
 */

export const YUAN_PER_CREDIT = 0.035
export const CREDITS_PER_YUAN = 200 / 7 // = 1 / 0.035 ≈ 28.571428571

/** 元 → 新积分（保留 3 位小数；用于历史数据迁移） */
export function yuanToCredits(yuan: number): number {
  return Math.round(yuan * CREDITS_PER_YUAN * 1000) / 1000
}

/** 新积分 → 元（保留 3 位小数；用于展示折算） */
export function creditsToYuan(credits: number): number {
  return Math.round(credits * YUAN_PER_CREDIT * 1000) / 1000
}

/**
 * 查询某 apiKey 的「新积分」余额。
 *
 * TODO(待接口)：当前为占位实现 —— 调用 ToAPIs /v1/balance 返回 CNY 余额，
 * credits 字段返回 null 表示「新积分待接口接入」。待用户提供的「获取新积分接口」
 * 到位后，只需替换此函数体；调用方（端点、前端展示）无需改动。
 *
 * 注意：占位期间前端会标注「新积分待接口」并展示 ToAPIs CNY 余额，
 * **绝不**按 0.035 折算为新积分，以免数值错乱。
 */
export async function fetchKeyCredits(
  apiKey: string
): Promise<{ credits: number | null; placeholderCNY: number | null; currency: string }> {
  try {
    const { getBalance } = await import('./toapis.js')
    const r = await getBalance(apiKey)
    return { credits: null, placeholderCNY: r.balance, currency: r.currency }
  } catch {
    return { credits: null, placeholderCNY: null, currency: 'CNY' }
  }
}
