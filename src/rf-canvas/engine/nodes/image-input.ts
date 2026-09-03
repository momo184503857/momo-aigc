import type { NodeRunResult, NodeModule } from './types'
import type { ImageAsset, ImageInputConfig, PortDef, RFFlowNode } from '../../types'

function isImageAsset(value: unknown): value is ImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.url === 'string' && typeof asset.fileName === 'string'
}

/** image-input / image-ai 上传上限（默认 14，对齐逻辑模型默认 maxReferenceImages） */
export const DEFAULT_MAX_REF_IMAGES = 14

const imageInput: NodeModule = {
  type: 'image-input',
  title: '图片输入',
  description: '上传商品图、参考图或模板图（上传即刻落站内存储，不存 base64）。',
  getInputs: () => [],
  getOutputs: (): PortDef[] => [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'output' }],
  defaultConfig: { images: [] } satisfies ImageInputConfig,

  getSummary(node: RFFlowNode) {
    const images = Array.isArray(node.data.config.images) ? (node.data.config.images as unknown[]) : []
    return images.length ? `${images.length} 张图片` : '未上传'
  },

  async run({ node }): Promise<NodeRunResult> {
    const images = node.data.config.images
    if (!Array.isArray(images) || !images.every(isImageAsset) || images.length === 0) {
      return {
        success: false,
        message: `节点「${node.data.title}」未上传图片。`,
        retryable: false,
      }
    }
    return {
      success: true,
      result: {
        dataType: 'Image',
        value: { imageList: images as ImageAsset[] },
        updatedAt: new Date().toISOString(),
      },
    }
  },
}

export default imageInput
