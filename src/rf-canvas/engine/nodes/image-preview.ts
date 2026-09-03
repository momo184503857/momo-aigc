import type { NodeRunResult, NodeModule } from './types'
import type { ImageNodeValue, PortDef, RFFlowNode } from '../../types'

function isImageNodeValue(value: unknown): value is ImageNodeValue {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as Record<string, unknown>).imageList)
}

const imagePreview: NodeModule = {
  type: 'image-preview',
  title: '图片预览',
  description: '展示并透传上游图片（点击可放大）。',
  getInputs: (): PortDef[] => [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'input' }],
  getOutputs: (): PortDef[] => [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'output' }],
  defaultConfig: {},

  getSummary(node: RFFlowNode) {
    const value = node.data.result?.value
    if (isImageNodeValue(value)) return `${value.imageList.length} 张图片`
    return '透传上游图片'
  },

  async run({ node, inputs }): Promise<NodeRunResult> {
    const input = inputs.image
    if (!input || !isImageNodeValue(input.value)) {
      return { success: false, message: `节点「${node.data.title}」缺少 Image 输入。`, retryable: false }
    }
    const value = input.value
    return {
      success: true,
      result: {
        dataType: 'Image',
        value: { imageList: value.imageList, taskNo: value.taskNo },
        updatedAt: new Date().toISOString(),
      },
    }
  },
}

export default imagePreview
