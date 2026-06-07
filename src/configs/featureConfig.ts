import type { ModelId } from '@/types/adapter'

export interface ImageSlot {
  key: string
  label: string
  maxCount: number
  required: boolean
  section: 'reference' | 'supplementary'
}

export interface FeatureConfig {
  id: string
  label: string
  imageSlots: ImageSlot[]
  hasUserPrompt: boolean
  hasSupplementaryImages: boolean
  defaultModelId?: ModelId
  defaultResolution?: string
  defaultAspectRatio?: string
}

export const FEATURE_CONFIGS: Record<string, FeatureConfig> = {
  'change-clothes': {
    id: 'change-clothes',
    label: '换衣服',
    imageSlots: [
      { key: 'model', label: '模特图', maxCount: 1, required: true, section: 'reference' },
      { key: 'garment', label: '衣服图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  'change-bg': {
    id: 'change-bg',
    label: '换背景',
    imageSlots: [
      { key: 'model', label: '模特图', maxCount: 1, required: true, section: 'reference' },
      { key: 'bg-ref', label: '背景参考', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  'change-face': {
    id: 'change-face',
    label: '换脸',
    imageSlots: [
      { key: 'target', label: '目标图', maxCount: 1, required: true, section: 'reference' },
      { key: 'source', label: '源脸图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  'detail-pic': {
    id: 'detail-pic',
    label: '细节图',
    imageSlots: [
      { key: 'product', label: '模板图', maxCount: 1, required: true, section: 'reference' },
      { key: 'detail-ref', label: '衣服图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  'fabric-pic': {
    id: 'fabric-pic',
    label: '面料图',
    imageSlots: [
      { key: 'product', label: '模板图', maxCount: 1, required: true, section: 'reference' },
      { key: 'fabric-ref', label: '衣服图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  'flat-pic': {
    id: 'flat-pic',
    label: '平铺图',
    imageSlots: [
      { key: 'product', label: '模板图', maxCount: 1, required: true, section: 'reference' },
      { key: 'scene-ref', label: '衣服图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  '3d-pic': {
    id: '3d-pic',
    label: '3D图',
    imageSlots: [
      { key: 'product', label: '模板图', maxCount: 1, required: true, section: 'reference' },
      { key: 'angle-ref', label: '衣服图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  'ai-photography': {
    id: 'ai-photography',
    label: 'AI摄影',
    imageSlots: [],
    hasUserPrompt: true,
    hasSupplementaryImages: true,
  },
  'model-gen': {
    id: 'model-gen',
    label: '模特生成',
    imageSlots: [],
    hasUserPrompt: true,
    hasSupplementaryImages: false,
  },
  'three-view': {
    id: 'three-view',
    label: '三视图',
    imageSlots: [
      { key: 'front', label: '正面图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
    hasSupplementaryImages: false,
  },
}

export function getFeatureLabel(featureId: string): string {
  return FEATURE_CONFIGS[featureId]?.label || featureId
}
