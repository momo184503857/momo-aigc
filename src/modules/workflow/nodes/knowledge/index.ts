import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'

const knowledge: NodeModule = {
  type: 'knowledge',
  title: '知识库',
  description: '持有大段规则/基调文本，可与上游文本合并输出。',
  icon: 'Notebook',
  color: 'var(--ds-chart-teal)',
  inputs: [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'input' }],
  outputs: [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'output' }],
  defaultConfig: { content: '', mergeMode: 'rules-first' },

  getSummary(config) {
    const content = typeof config.content === 'string' ? config.content : ''
    if (!content.trim()) return '未填写内容'
    const lines = content.trim().split('\n').length
    return `${content.length} 字 · ${lines} 行`
  },

  async run(workflow, node): Promise<NodeRunResult> {
    const content = typeof node.config.content === 'string' ? node.config.content : ''
    const mergeMode = node.config.mergeMode === 'upstream-first' ? 'upstream-first' : 'rules-first'

    if (!content.trim()) {
      return { success: false, message: `节点「${node.title}」知识库内容为空，请在配置中填写。` }
    }

    const inputs = resolveNodeInputs(workflow, node.id)
    const upstream = inputs.text?.result.value
    const upstreamText = typeof upstream === 'string' ? upstream.trim() : ''

    const merged = upstreamText
      ? mergeMode === 'rules-first'
        ? `${content}\n\n---\n\n${upstreamText}`
        : `${upstreamText}\n\n---\n\n${content}`
      : content

    return {
      success: true,
      result: { dataType: 'Text', value: merged, updatedAt: new Date().toISOString() },
      logs: upstreamText
        ? [{ level: 'info', message: `知识库 ${content.length} 字已与上游文本 ${upstreamText.length} 字合并（${mergeMode === 'rules-first' ? '规则在前' : '上游在前'}）。` }]
        : [{ level: 'info', message: `知识库输出 ${content.length} 字（无上游文本）。` }],
    }
  },
}

export default knowledge
