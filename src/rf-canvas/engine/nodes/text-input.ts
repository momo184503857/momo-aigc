import type { NodeRunResult, NodeModule } from './types'
import type { PortDef, TextInputConfig, RFFlowNode } from '../../types'

const textInput: NodeModule = {
  type: 'text-input',
  title: '文本输入',
  description: '输入商品信息、卖点和补充说明。',
  getInputs: () => [],
  getOutputs: (): PortDef[] => [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'output' }],
  defaultConfig: { text: '' } satisfies TextInputConfig,

  getSummary(node: RFFlowNode) {
    const text = typeof node.data.config.text === 'string' ? node.data.config.text : ''
    const trimmed = text.trim()
    return trimmed ? trimmed.slice(0, 40) + (trimmed.length > 40 ? '…' : '') : '未填写'
  },

  async run({ node }): Promise<NodeRunResult> {
    const text = typeof node.data.config.text === 'string' ? node.data.config.text : ''
    return {
      success: true,
      result: { dataType: 'Text', value: text, updatedAt: new Date().toISOString() },
    }
  },
}

export default textInput
