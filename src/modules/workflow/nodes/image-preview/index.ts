import type { NodeModule } from '@/modules/workflow/nodes/types'
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'

function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.id === 'string' && typeof asset.fileName === 'string' && typeof asset.localPath === 'string' && typeof asset.previewUrl === 'string'
}

const imagePreview: NodeModule = {
  type: 'image-preview',
  title: '图片预览',
  description: '展示并透传上游图片。',
  icon: 'Monitor',
  color: '#909399',
  inputs: [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'input' }],
  outputs: [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'output' }],
  defaultConfig: {},

  getSummary() { return '透传上游图片' },

  async run(workflow, node) {
    const inputs = resolveNodeInputs(workflow, node.id)
    const input = inputs.image

    if (input && isLocalImageAsset(input.result.value)) {
      const img = input.result.value
      return {
        success: true,
        result: { dataType: 'Image', value: { image: img, imageList: [img] }, updatedAt: new Date().toISOString() },
      }
    }

    // Check if value is ImageNodeResultValue
    if (input && input.result.value && typeof input.result.value === 'object') {
      const val = input.result.value as Record<string, unknown>
      if (isLocalImageAsset(val.image)) {
        return {
          success: true,
          result: { dataType: 'Image', value: { image: val.image, imageList: [val.image] }, updatedAt: new Date().toISOString() },
        }
      }
    }

    return { success: false, message: `节点「${node.title}」缺少 Image 输入。` }
  },
}

export default imagePreview
