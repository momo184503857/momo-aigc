export type ModelId =
  | 'gpt-image-2'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-2.5-flash-image-preview'

const PRICING: Record<string, Record<string, number>> = {
  'gpt-image-2':                { '1K': 0.105, '2K': 0.14,  '4K': 0.175 },
  'gemini-3-pro-image-preview': { '1K': 0.35,  '2K': 0.35,  '4K': 0.7   },
  'gemini-3.1-flash-image-preview': { '512': 0.175, '1K': 0.175, '2K': 0.175, '4K': 0.175 },
  'gemini-2.5-flash-image-preview': { '1K': 0.084 },
}

export function getPrice(model: string, resolution: string): number {
  return PRICING[model]?.[resolution] ?? PRICING[model]?.[Object.keys(PRICING[model] || {})[0]] ?? 0
}

export function calculateCost(model: string, resolution: string, n: number = 1): number {
  const unitPrice = getPrice(model, resolution)
  return Math.round(unitPrice * n * 1000) / 1000
}
