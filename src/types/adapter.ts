/**
 * 模型相关纯类型与展示工具（ai-provider 重构后）。
 *
 * 模型清单/能力/定价的唯一真源已迁移到后端模型目录（GET /api/models/catalog），
 * 前端统一经 `stores/modelCatalog.ts` 读取；本文件不再持有任何模型常量。
 */

/** 任务/作品里保存的模型名快照（渠道模型名字符串） */
export type ModelId = string

// ── 积分展示格式化（所有展示点统一调用，禁止散写换算）──
// 2026-09-01 起汇率 1:1（1 积分 = ¥1），积分与人民币数值恒等，
// 界面收敛为积分单显（不再双显 ¥ 括号）；存量金额已由后端 migration_credits_v2 换算。
export const YUAN_PER_CREDIT = 1

/** 积分 → 元（保留 3 位小数；1:1 后为恒等换算，供需要 ¥ 口径的图表使用） */
export function creditsToYuan(credits: number): number {
  return Math.round(credits * YUAN_PER_CREDIT * 1000) / 1000
}

export interface CreditFormatOptions {
  /** 积分数值小数位（默认 3；余额等大数场景传 0，明细场景传 2） */
  creditDigits?: number
}

/** 统一格式化：formatCredits(0.105) → "0.105 积分" */
export function formatCredits(credits: number, opts: CreditFormatOptions = {}): string {
  const { creditDigits = 3 } = opts
  return `${credits.toFixed(creditDigits)} 积分`
}
