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
      { key: 'detail', label: '细节图片', maxCount: 5, required: false, section: 'supplementary' },
    ],
    hasUserPrompt: true,
  },
  'change-bg': {
    id: 'change-bg',
    label: '换背景',
    imageSlots: [
      { key: 'model', label: '模特图', maxCount: 1, required: true, section: 'reference' },
      { key: 'bg-ref', label: '背景参考', maxCount: 3, required: false, section: 'supplementary' },
    ],
    hasUserPrompt: true,
    defaultAspectRatio: '3:4',
  },
  'change-face': {
    id: 'change-face',
    label: '换脸',
    imageSlots: [
      { key: 'target', label: '目标图', maxCount: 1, required: true, section: 'reference' },
      { key: 'source', label: '源脸图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
  },
  'detail-pic': {
    id: 'detail-pic',
    label: '细节图',
    imageSlots: [
      { key: 'product', label: '商品图', maxCount: 1, required: true, section: 'reference' },
      { key: 'detail-ref', label: '细节参考', maxCount: 3, required: false, section: 'supplementary' },
    ],
    hasUserPrompt: true,
  },
  'fabric-pic': {
    id: 'fabric-pic',
    label: '面料图',
    imageSlots: [
      { key: 'fabric', label: '面料样图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
  },
  'flat-pic': {
    id: 'flat-pic',
    label: '平铺图',
    imageSlots: [
      { key: 'product', label: '商品图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
  },
  '3d-pic': {
    id: '3d-pic',
    label: '3D图',
    imageSlots: [
      { key: 'product', label: '商品图', maxCount: 1, required: true, section: 'reference' },
    ],
    hasUserPrompt: true,
  },
  'model-gen': {
    id: 'model-gen',
    label: '模特生成',
    imageSlots: [
      { key: 'ref-model', label: '参考模特', maxCount: 3, required: false, section: 'reference' },
    ],
    hasUserPrompt: true,
  },
  'three-view': {
    id: 'three-view',
    label: '三视图',
    imageSlots: [
      { key: 'front', label: '正面图', maxCount: 1, required: true, section: 'reference' },
      { key: 'side', label: '侧面图', maxCount: 1, required: false, section: 'supplementary' },
      { key: 'back', label: '背面图', maxCount: 1, required: false, section: 'supplementary' },
    ],
    hasUserPrompt: true,
  },
}

export function getFeatureLabel(featureId: string): string {
  return FEATURE_CONFIGS[featureId]?.label || featureId
}
