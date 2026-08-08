import type { NodeModule } from '@/modules/workflow/nodes/types'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'

const textPreview: NodeModule = {
  type: 'text-preview',
  title: '文本预览',
  description: '展示并透传上游文本。',
  icon: 'View',
  color: '#86909c',
  inputs: [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'input', required: true }],
  outputs: [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'output' }],
  defaultConfig: {},

  getSummary() { return '透传上游文本' },

  async run(workflow, node) {
    const inputs = resolveNodeInputs(workflow, node.id)
    const input = inputs.text
    if (!input) {
      return { success: false, message: `节点「${node.title}」缺少 Text 输入。` }
    }
    const value = input.result.dataType === 'Text' ? input.result.value : undefined
    if (typeof value !== 'string') {
      return { success: false, message: `节点「${node.title}」缺少 Text 输入。` }
    }
    return {
      success: true,
      result: { dataType: 'Text', value, updatedAt: new Date().toISOString() },
    }
  },
}

export default textPreview
