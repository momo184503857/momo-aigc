/**
 * 新积分体系常量与换算。
 *
 * 1 新积分 = 1 元（人民币，2026-09-01 起汇率 1:1）。平台以「新积分」为存储与扣费主单位，
 * 「人民币（元）」为等值展示副单位。历史曾为 0.035（元/积分），存量金额与定价已由
 * migration_credits_v2（×0.035）一次性换算，账目价值不变。
 */

export const YUAN_PER_CREDIT = 1
export const CREDITS_PER_YUAN = 1 // 历史：200/7（= 1/0.035）；credits_v2 起 1:1

/** 新积分 → 元（保留 3 位小数；用于展示折算） */
export function creditsToYuan(credits: number): number {
  return Math.round(credits * YUAN_PER_CREDIT * 1000) / 1000
}
