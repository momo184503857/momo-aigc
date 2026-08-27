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

