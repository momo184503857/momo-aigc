/**
 * 模型定义 — 直接使用 ToAPIs provider model name 作为 ModelId
 * 只有一个渠道，不需要 ChannelId / CHANNEL_MODEL_MAP 抽象
 */

export type ModelId =
  | 'gpt-image-2'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-2.5-flash-image-preview'

export interface ModelInfo {
  id: ModelId
  name: string
  resolutions: string[]
  aspectRatios: string[]
  /** Resolution-dependent overrides; if absent for a resolution, fall back to aspectRatios */
  aspectRatiosByResolution?: Record<string, string[]>
  maxReferenceImages: number
  maxPromptChars: number
  pricing: Record<string, number> // resolution → price in 新积分（1 新积分 = ¥0.035）
}

export const MODELS: ModelInfo[] = [
  {
    id: 'gpt-image-2',
    name: 'GPT-Image-2',
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: [
      '1:1', '16:9', '9:16', '4:3', '3:4',
      '4:5', '5:4', '2:3', '3:2', '21:9',
    ],
    aspectRatiosByResolution: {
      '1K': ['1:1', '4:3', '3:4'],
      '2K': ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '2:3', '3:2', '21:9'],
      '4K': ['16:9', '9:16', '21:9', '4:3', '3:4', '2:3', '3:2'],
    },
    maxReferenceImages: 14,
    maxPromptChars: 32000,
    pricing: { '1K': 3, '2K': 4, '4K': 5 },
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: [
      '1:1', '16:9', '9:16', '4:3', '3:4',
      '4:5', '5:4', '2:3', '3:2', '21:9',
    ],
    maxReferenceImages: 14,
    maxPromptChars: 32000,
    pricing: { '1K': 10, '2K': 10, '4K': 20 },
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    resolutions: ['512', '1K', '2K', '4K'],
    aspectRatios: [
      '1:1', '16:9', '9:16', '4:3', '3:4',
      '4:5', '5:4', '2:3', '3:2',
      '1:4', '4:1', '1:8', '8:1', '21:9',
    ],
    maxReferenceImages: 14,
    maxPromptChars: 32000,
    pricing: { '512': 5, '1K': 5, '2K': 5, '4K': 5 },
  },
  {
    id: 'gemini-2.5-flash-image-preview',
    name: 'Gemini 2.5 Flash Image',
    resolutions: ['1K'],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    maxReferenceImages: 14,
    maxPromptChars: 1000,
    pricing: { '1K': 2.4 },
  },
]

export const DEFAULT_MODEL: ModelId = 'gpt-image-2'
export const DEFAULT_RESOLUTION = '2K'
export const DEFAULT_ASPECT_RATIO = '1:1'

/** Get the effective aspect ratios for a model at a given resolution */
export function getAspectRatios(model: ModelInfo, resolution: string): string[] {
  if (model.aspectRatiosByResolution?.[resolution]) {
    return model.aspectRatiosByResolution[resolution]
  }
  return model.aspectRatios
}

/** Get the price in 新积分 for a model at a given resolution */
export function getPrice(model: ModelInfo, resolution: string): number {
  return model.pricing[resolution] ?? model.pricing[model.resolutions[0]] ?? 0
}

// ── 新积分展示格式化（所有展示点统一调用，禁止手写 ×0.035）──
export const YUAN_PER_CREDIT = 0.035

/** 新积分 → 元（保留 3 位小数，展示折算用） */
export function creditsToYuan(credits: number): number {
  return Math.round(credits * YUAN_PER_CREDIT * 1000) / 1000
}

/** 元 → 新积分（保留 1 位小数，余额展示用） */
export function yuanToCredits(yuan: number): number {
  return Math.round(yuan / YUAN_PER_CREDIT * 10) / 10
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
