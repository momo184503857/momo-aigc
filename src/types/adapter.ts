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
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: [
      '1:1', '16:9', '9:16', '4:3', '3:4',
      '4:5', '5:4', '2:3', '3:2', '21:9',
    ],
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
  },
  {
    id: 'gemini-2.5-flash-image-preview',
    name: 'Gemini 2.5 Flash Image',
    resolutions: ['1K'],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
]

export const DEFAULT_MODEL: ModelId = 'gpt-image-2'
export const DEFAULT_RESOLUTION = '1K'
export const DEFAULT_ASPECT_RATIO = '1:1'
