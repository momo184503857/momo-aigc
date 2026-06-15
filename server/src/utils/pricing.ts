export type ModelId =
  | 'gpt-image-2'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-2.5-flash-image-preview'

// 单位：新积分（1 新积分 = ¥0.035）。历史曾用元（旧值 ÷0.035 即此处整数）。
const PRICING: Record<string, Record<string, number>> = {
  'gpt-image-2':                { '1K': 3,   '2K': 4,  '4K': 5  },
  'gemini-3-pro-image-preview': { '1K': 10,  '2K': 10, '4K': 20 },
  'gemini-3.1-flash-image-preview': { '512': 5, '1K': 5, '2K': 5, '4K': 5 },
  'gemini-2.5-flash-image-preview': { '1K': 2.4 },
}

export function getPrice(model: string, resolution: string): number {
  return PRICING[model]?.[resolution] ?? PRICING[model]?.[Object.keys(PRICING[model] || {})[0]] ?? 0
}

export function calculateCost(model: string, resolution: string, n: number = 1): number {
  const unitPrice = getPrice(model, resolution)
  return Math.round(unitPrice * n * 1000) / 1000
}
