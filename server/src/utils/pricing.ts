export type ModelId =
  | 'gpt-image-2'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-2.5-flash-image-preview'

// 单位：新积分（1 积分 = ¥1）。历史单价（0.035 汇率时代的整数）已 ×0.035 换算，价值不变。
// 仅用于历史「个人 Key 任务」消耗折算（points.ts /me/daily）；现行定价真源是 ai_models.pricing。
const PRICING: Record<string, Record<string, number>> = {
  'gpt-image-2':                { '1K': 0.105, '2K': 0.14, '4K': 0.175 },
  'gemini-3-pro-image-preview': { '1K': 0.35,  '2K': 0.42, '4K': 0.56 },
  'gemini-3.1-flash-image-preview': { '512': 0.175, '1K': 0.21, '2K': 0.28, '4K': 0.42 },
  'gemini-2.5-flash-image-preview': { '1K': 0.084 },
}

export function getPrice(model: string, resolution: string): number {
  return PRICING[model]?.[resolution] ?? PRICING[model]?.[Object.keys(PRICING[model] || {})[0]] ?? 0
}

export function calculateCost(model: string, resolution: string, n: number = 1): number {
  const unitPrice = getPrice(model, resolution)
  return Math.round(unitPrice * n * 1000) / 1000
}
