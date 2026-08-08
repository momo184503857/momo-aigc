import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import type { NodePort, PromptSplitterNodeConfig } from '@/modules/workflow/types/workflow'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'

function isPromptSplitterConfig(config: Record<string, unknown>): boolean {
  return typeof config.delimiter === 'string' && typeof config.trimWhitespace === 'boolean' && typeof config.ignoreEmpty === 'boolean' && Boolean(config.editedOutputs) && typeof config.editedOutputs === 'object' && !Array.isArray(config.editedOutputs)
}

function normalizePieces(text: string, config: PromptSplitterNodeConfig): string[] {
  const rawPieces = config.delimiter ? text.split(config.delimiter) : [text]
  const normalized = config.trimWhitespace ? rawPieces.map((item) => item.trim()) : rawPieces
  return config.ignoreEmpty ? normalized.filter((item) => item.length > 0) : normalized
}

const promptSplitter: NodeModule = {
  type: 'prompt-splitter',
  title: '提示词拆分',
  description: '按分隔符拆分文本，动态生成输出口。',
  icon: 'Scissor',
  color: '#fa742b',
  inputs: [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'input', required: true }],
  outputs: [{ id: 'output_1', name: '输出1', dataType: 'Text', direction: 'output' }],
  defaultConfig: { delimiter: '---', trimWhitespace: true, ignoreEmpty: true, editedOutputs: {} },

  getSummary(config) {
    const d = typeof config.delimiter === 'string' ? config.delimiter : '---'
    return `分隔符: "${d}"`
  },

  async run(workflow, node): Promise<NodeRunResult> {
    if (!isPromptSplitterConfig(node.config)) {
      return { success: false, message: `节点「${node.title}」提示词拆分配置无效。` }
    }

    const inputs = resolveNodeInputs(workflow, node.id)
    const input = inputs.text
    if (!input || typeof input.result.value !== 'string') {
      return { success: false, message: `节点「${node.title}」缺少 Text 输入。` }
    }

    const cleanText = input.result.value.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    const config = node.config as unknown as PromptSplitterNodeConfig
    const pieces = normalizePieces(cleanText, config)
    if (!pieces.length) {
      return { success: false, message: `节点「${node.title}」拆分结果为空。` }
    }

    const outputMap: Record<string, string> = {}
    const outputs: NodePort[] = pieces.map((piece, index) => {
      const id = `output_${index + 1}`
      outputMap[id] = config.editedOutputs[id] ?? piece
      return { id, name: `输出${index + 1}`, dataType: 'Text', direction: 'output' }
    })

    return {
      success: true,
      result: { dataType: 'Text', value: outputMap, updatedAt: new Date().toISOString() },
      outputs,
      logs: [{ level: 'info', message: `已拆分为 ${outputs.length} 段。` }],
    }
  },
}

export default promptSplitter
