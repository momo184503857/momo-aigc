import type { NodeModule } from '@/modules/workflow/nodes/types'
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'

function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.id === 'string' && typeof asset.fileName === 'string' && typeof asset.localPath === 'string' && typeof asset.previewUrl === 'string'
}

const imageInput: NodeModule = {
  type: 'image-input',
  title: '图片输入',
  description: '上传商品图、参考图或模板图。',
  icon: 'Picture',
  color: '#31c19e',
  inputs: [],
  outputs: [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'output' }],
  defaultConfig: { images: [] },

  getSummary(config) {
    const images = Array.isArray(config.images) ? config.images : []
    return images.length ? images[0].fileName || '已上传' : '未上传'
  },

  async run(_workflow, node) {
    const images = node.config.images
    if (!Array.isArray(images) || !images.every(isLocalImageAsset)) {
      return { success: false, message: `节点「${node.title}」图片配置无效。` }
    }
    return {
      success: true,
      result: {
        dataType: 'Image',
        value: { image: images[0], imageList: images },
        updatedAt: new Date().toISOString(),
      },
    }
  },
}

export default imageInput
