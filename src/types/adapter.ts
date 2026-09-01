/**
 * 模型相关纯类型与展示工具（ai-provider 重构后）。
 *
 * 模型清单/能力/定价的唯一真源已迁移到后端模型目录（GET /api/models/catalog），
 * 前端统一经 `stores/modelCatalog.ts` 读取；本文件不再持有任何模型常量。
 */

/** 任务/作品里保存的模型名快照（渠道模型名字符串） */
export type ModelId = string

// ── 积分展示格式化（所有展示点统一调用，禁止散写换算）──
// 汇率 1:1（1 积分 = ¥1），积分与人民币数值恒等，界面为积分单显（不再双显 ¥ 括号）。
// 精度规则：全链路统一 2 位小数（账务存储同精度，后端 migration_credits_dp2 已取整存量），
// 展示一律向上取整（0.105 → 0.11）。
export const YUAN_PER_CREDIT = 1

/** 积分 → 元（保留 2 位小数；1:1 后为恒等换算，供需要 ¥ 口径的图表使用） */
export function creditsToYuan(credits: number): number {
  return Math.round(credits * YUAN_PER_CREDIT * 100) / 100
}

export interface CreditFormatOptions {
  /** 积分数值小数位（默认 2，与账务存储精度一致，一般无需传） */
  creditDigits?: number
}

/**
 * 积分数值向上取整到 digits 位小数（0 ≤ digits ≤ 3）。
 * 先取毫厘整数（对齐账务精度、消除聚合浮点 dust）再进位，避免浮点噪声多进一分。
 */
export function ceilCreditValue(credits: number, digits = 2): number {
  const milli = Math.round(credits * 1000)
  const unit = 10 ** (3 - digits)
  return (Math.ceil(milli / unit) * unit) / 1000
}

/** 统一格式化：formatCredits(0.105) → "0.11 积分"（向上取整） */
export function formatCredits(credits: number, opts: CreditFormatOptions = {}): string {
  const { creditDigits = 2 } = opts
  return `${ceilCreditValue(credits, creditDigits).toFixed(creditDigits)} 积分`
}
