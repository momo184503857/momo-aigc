import type { NodeRunResult, NodeModule } from './types'
import type { PortDef, RFFlowNode } from '../../types'

const textPreview: NodeModule = {
  type: 'text-preview',
  title: '文本预览',
  description: '展示并透传上游文本。',
  getInputs: (): PortDef[] => [
    { id: 'text', name: 'Text', dataType: 'Text', direction: 'input', required: true },
  ],
  getOutputs: (): PortDef[] => [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'output' }],
  defaultConfig: {},

  getSummary() {
    return '透传上游文本'
  },

  async run({ node, inputs }): Promise<NodeRunResult> {
    const input = inputs.text
    if (!input || typeof input.value !== 'string') {
      return { success: false, message: `节点「${node.data.title}」缺少 Text 输入。`, retryable: false }
    }
    return {
      success: true,
      result: { dataType: 'Text', value: input.value, updatedAt: new Date().toISOString() },
    }
  },
}

export default textPreview
