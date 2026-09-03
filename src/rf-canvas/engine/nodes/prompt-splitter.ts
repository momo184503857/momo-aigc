import type { NodeRunResult, NodeModule } from './types'
import type { PortDef, PromptSplitterConfig, RFFlowNode } from '../../types'

function normalizePieces(text: string, delimiter: string): string[] {
  const raw = delimiter ? text.split(delimiter) : [text]
  return raw.map((piece) => piece.trim()).filter((piece) => piece.length > 0)
}

/** 上次结果（或改写）对应的输出端口：output_1..N；无结果时保底 1 个 */
export function splitterOutputCount(node: RFFlowNode): number {
  const result = node.data.result
  if (result?.dataType === 'Text' && result.value && typeof result.value === 'object' && !Array.isArray(result.value)) {
    const keys = Object.keys(result.value as Record<string, unknown>).filter((k) => k.startsWith('output_'))
    if (keys.length > 0) return keys.length
  }
  return 1
}

const promptSplitter: NodeModule = {
  type: 'prompt-splitter',
  title: '提示词拆分',
  description: '按分隔符拆分文本，动态生成输出口，可人工改写各段。',
  getInputs: (): PortDef[] => [
    { id: 'text', name: 'Text', dataType: 'Text', direction: 'input', required: true },
  ],
  getOutputs: (node): PortDef[] =>
    Array.from({ length: splitterOutputCount(node) }, (_, i) => ({
      id: `output_${i + 1}`,
      name: `输出${i + 1}`,
      dataType: 'Text' as const,
      direction: 'output' as const,
    })),
  defaultConfig: {
    delimiter: '---',
    stripThinkBlocks: true,
    pauseAfterRun: false,
    editedOutputs: {},
  } satisfies PromptSplitterConfig,

  getSummary(node: RFFlowNode) {
    const d = typeof node.data.config.delimiter === 'string' && node.data.config.delimiter ? node.data.config.delimiter : '---'
    return `分隔符 "${d}" · ${splitterOutputCount(node)} 个输出口`
  },

  async run({ node, inputs }): Promise<NodeRunResult> {
    const config = node.data.config
    const delimiter = typeof config.delimiter === 'string' ? config.delimiter : '---'
    const stripThinkBlocks = config.stripThinkBlocks !== false
    const editedOutputs =
      config.editedOutputs && typeof config.editedOutputs === 'object' ? (config.editedOutputs as Record<string, string>) : {}
    const title = node.data.title

    const input = inputs.text
    if (!input || typeof input.value !== 'string') {
      return { success: false, message: `节点「${title}」缺少 Text 输入。`, retryable: false }
    }

    let cleanText = input.value
    if (stripThinkBlocks) {
      cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/g, '')
    }
    cleanText = cleanText.trim()

    const pieces = normalizePieces(cleanText, delimiter)
    if (!pieces.length) {
      return { success: false, message: `节点「${title}」拆分结果为空。`, retryable: false }
    }

    const outputMap: Record<string, string> = {}
    pieces.forEach((piece, index) => {
      const id = `output_${index + 1}`
      outputMap[id] = editedOutputs[id] ?? piece
    })

    return {
      success: true,
      result: { dataType: 'Text', value: outputMap, updatedAt: new Date().toISOString() },
      logs: [{ time: new Date().toISOString(), level: 'info', message: `已拆分为 ${pieces.length} 段。` }],
    }
  },
}

export default promptSplitter
