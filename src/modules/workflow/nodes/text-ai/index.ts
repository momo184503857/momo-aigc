import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { canvasApi } from '@/services/canvasApi'

const textAi: NodeModule = {
  type: 'text-ai',
  title: '文字 AI',
  description: '调用全局文字模型生成提示词或文案。',
  icon: 'ChatDotRound',
  color: '#9266F5',
  inputs: [
    { id: 'text', name: 'Text', dataType: 'Text', direction: 'input' },
    { id: 'image', name: 'Image', dataType: 'Image', direction: 'input' },
  ],
  outputs: [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'output' }],
  defaultConfig: { modelName: '', taskPrompt: '', detailPrompt: '', pauseAfterRun: false, temperature: undefined, maxTokens: undefined },

  getSummary(config) {
    const model = typeof config.modelName === 'string' && config.modelName ? config.modelName : '未选模型'
    const task = typeof config.taskPrompt === 'string' && config.taskPrompt ? config.taskPrompt.slice(0, 30) : ''
    return task ? `${model} · ${task}...` : model
  },

  async run(workflow, node): Promise<NodeRunResult> {
    const config = node.config
    const taskPrompt = typeof config.taskPrompt === 'string' ? config.taskPrompt : ''
    const detailPrompt = typeof config.detailPrompt === 'string' ? config.detailPrompt : ''
    const modelName = typeof config.modelName === 'string' ? config.modelName : ''

    const inputs = resolveNodeInputs(workflow, node.id)
    const upstreamInput = inputs.text
    const upstreamText = upstreamInput && typeof upstreamInput.result.value === 'string' ? upstreamInput.result.value : undefined

    if (!taskPrompt.trim() && !detailPrompt.trim() && typeof upstreamText !== 'string') {
      return { success: false, message: `节点「${node.title}」缺少有效提示内容或上游输入。` }
    }

    const prompt = ['[Task]', taskPrompt, '', '[Details]', detailPrompt, '', '[Upstream text]', upstreamText ?? ''].join('\n')

    const logs: NodeRunResult['logs'] = [{ level: 'info', message: `请求参数: ${JSON.stringify({ taskPrompt: taskPrompt.slice(0, 200), detailPrompt: detailPrompt.slice(0, 200), hasUpstreamText: typeof upstreamText === 'string' })}` }]

    try {
      const startedAt = Date.now()
      const result = await canvasApi.chat({
        model: modelName || 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: config.temperature as number | undefined,
        maxTokens: config.maxTokens as number | undefined,
      })
      const durationMs = Date.now() - startedAt

      if (!result.text?.trim()) {
        logs.push({ level: 'warn', message: '文字模型返回了空内容。' })
        return { success: false, message: `节点「${node.title}」文字模型返回空内容。`, logs }
      }

      logs.push({ level: 'info', message: `响应成功，耗时 ${(durationMs / 1000).toFixed(1)}s，输出 ${result.text.length} 字符。` })
      return { success: true, result: { dataType: 'Text', value: result.text, updatedAt: new Date().toISOString() }, logs }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '文字模型调用失败'
      logs.push({ level: 'error', message: `文字模型调用失败: ${message}` })
      return { success: false, message, logs }
    }
  },
}

export default textAi
