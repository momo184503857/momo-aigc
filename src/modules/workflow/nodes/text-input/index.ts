import type { NodeModule } from '@/modules/workflow/nodes/types'

const textInput: NodeModule = {
  type: 'text-input',
  title: '文本输入',
  description: '输入商品信息、卖点和补充说明。',
  icon: 'EditPen',
  color: '#0088ff',
  inputs: [],
  outputs: [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'output' }],
  defaultConfig: { text: '' },

  getSummary(config) {
    const text = typeof config.text === 'string' ? config.text : ''
    return text.trim() ? text.trim().slice(0, 40) + (text.length > 40 ? '...' : '') : '未填写'
  },

  async run(_workflow, node) {
    const text = typeof node.config.text === 'string' ? node.config.text : ''
    return {
      success: true,
      result: { dataType: 'Text', value: text, updatedAt: new Date().toISOString() },
    }
  },
}

export default textInput
