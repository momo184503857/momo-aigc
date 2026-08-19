/**
 * 模型相关纯类型与展示工具（ai-provider 重构后）。
 *
 * 模型清单/能力/定价的唯一真源已迁移到后端模型目录（GET /api/models/catalog），
 * 前端统一经 `stores/modelCatalog.ts` 读取；本文件不再持有任何模型常量。
 */

/** 任务/作品里保存的模型名快照（渠道模型名字符串） */
export type ModelId = string

// ── 新积分展示格式化（所有展示点统一调用，禁止手写 ×0.035）──
export const YUAN_PER_CREDIT = 0.035

/** 新积分 → 元（保留 3 位小数，展示折算用） */
export function creditsToYuan(credits: number): number {
  return Math.round(credits * YUAN_PER_CREDIT * 1000) / 1000
}

export interface CreditFormatOptions {
  /** 积分数值小数位（默认 1；余额/整数场景传 0） */
  creditDigits?: number
  /** ¥元 小数位（默认 3） */
  yuanDigits?: number
  /** 仅显示积分部分（默认 false） */
  creditsOnly?: boolean
  /** 仅显示 ¥元 部分（默认 false） */
  yuanOnly?: boolean
}

/** 统一格式化：formatCredits(3) → "3.0 积分 (¥0.105)" */
export function formatCredits(credits: number, opts: CreditFormatOptions = {}): string {
  const { creditDigits = 1, yuanDigits = 3, creditsOnly = false, yuanOnly = false } = opts
  const yuan = creditsToYuan(credits)
  if (yuanOnly) return `¥${yuan.toFixed(yuanDigits)}`
  if (creditsOnly) return `${credits.toFixed(creditDigits)} 积分`
  return `${credits.toFixed(creditDigits)} 积分 (¥${yuan.toFixed(yuanDigits)})`
}
