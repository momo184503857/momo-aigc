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
  pricing: Record<string, number> // resolution → price in 元
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
    pricing: { '1K': 0.105, '2K': 0.14, '4K': 0.175 },
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
    pricing: { '1K': 0.35, '2K': 0.35, '4K': 0.7 },
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
    pricing: { '512': 0.175, '1K': 0.175, '2K': 0.175, '4K': 0.175 },
  },
  {
    id: 'gemini-2.5-flash-image-preview',
    name: 'Gemini 2.5 Flash Image',
    resolutions: ['1K'],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    maxReferenceImages: 14,
    maxPromptChars: 1000,
    pricing: { '1K': 0.084 },
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

/** Get the price in 元 for a model at a given resolution */
export function getPrice(model: ModelInfo, resolution: string): number {
  return model.pricing[resolution] ?? model.pricing[model.resolutions[0]] ?? 0
}
