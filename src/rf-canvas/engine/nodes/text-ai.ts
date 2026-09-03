import type { NodeRunResult, NodeModule } from './types'
import type { ImageNodeValue, PortDef, TextAiConfig, RFFlowNode, ImageAsset } from '../../types'
import { chat, extractErrorMessage, urlToBase64Image } from '../../api'
import type { ChatImage } from '../../api'

function isImageNodeValue(value: unknown): value is ImageNodeValue {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.imageList)
}

/** 从 image 输入端口提取图片 URL 列表（上游 image-input / image-ai / image-preview） */
function extractImageUrls(imageInput: unknown): string[] {
  if (!isImageNodeValue(imageInput)) return []
  const urls: string[] = []
  for (const asset of imageInput.imageList as ImageAsset[]) {
    if (typeof asset?.url === 'string' && asset.url) urls.push(asset.url)
  }
  return urls
}

const textAi: NodeModule = {
  type: 'text-ai',
  title: '文字 AI',
  description: '调用平台文字模型生成提示词或文案（不计积分）。',
  getInputs: (): PortDef[] => [
    { id: 'text', name: 'Text', dataType: 'Text', direction: 'input' },
    { id: 'image', name: 'Image', dataType: 'Image', direction: 'input' },
  ],
  getOutputs: (): PortDef[] => [{ id: 'text', name: 'Text', dataType: 'Text', direction: 'output' }],
  defaultConfig: {
    channelModelId: null,
    taskPrompt: '',
    detailPrompt: '',
    pauseAfterRun: false,
    temperature: undefined,
    maxTokens: undefined,
  } satisfies TextAiConfig,

  getSummary(node: RFFlowNode) {
    const task = typeof node.data.config.taskPrompt === 'string' ? node.data.config.taskPrompt : ''
    const modelSelected = typeof node.data.config.channelModelId === 'number'
    const label = modelSelected ? '已选模型' : '未选模型'
    return task ? `${label} · ${task.slice(0, 24)}…` : label
  },

  async run({ node, inputs, signal, addLog }): Promise<NodeRunResult> {
    const config = node.data.config
    const channelModelId = config.channelModelId
    const taskPrompt = typeof config.taskPrompt === 'string' ? config.taskPrompt : ''
    const detailPrompt = typeof config.detailPrompt === 'string' ? config.detailPrompt : ''
    const title = node.data.title

    if (typeof channelModelId !== 'number' || !channelModelId) {
      return { success: false, message: `节点「${title}」未选择文字模型。`, retryable: false }
    }

    const upstreamText =
      inputs.text && typeof inputs.text.value === 'string' ? inputs.text.value : undefined
    const imageUrls = inputs.image ? extractImageUrls(inputs.image.value) : []

    if (!taskPrompt.trim() && !detailPrompt.trim() && typeof upstreamText !== 'string') {
      return {
        success: false,
        message: `节点「${title}」缺少有效提示内容或上游输入。`,
        retryable: false,
      }
    }

    const prompt = ['[Task]', taskPrompt, '', '[Details]', detailPrompt, '', '[Upstream text]', upstreamText ?? ''].join('\n')

    // 图片必须走 images 字段（服务端把 messages 拍平为纯文本，多模态 content 会被丢弃）
    const images: ChatImage[] = []
    if (imageUrls.length) {
      addLog('info', `附带 ${imageUrls.length} 张参考图发给文字模型（vision）。`)
      try {
        for (const url of imageUrls) {
          images.push(await urlToBase64Image(url))
        }
      } catch (err) {
        return {
          success: false,
          message: `参考图读取失败：${extractErrorMessage(err, '图片下载失败')}`,
        }
      }
    }

    const startedAt = Date.now()
    try {
      const result = await chat({
        channelModelId,
        prompt,
        images,
        temperature: typeof config.temperature === 'number' ? config.temperature : undefined,
        maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : undefined,
        signal,
      })
      const durationMs = Date.now() - startedAt

      if (!result.text?.trim()) {
        return {
          success: false,
          message: `节点「${title}」文字模型返回空内容。`,
          logs: [{ time: new Date().toISOString(), level: 'warn', message: '文字模型返回了空内容。' }],
        }
      }

      return {
        success: true,
        result: { dataType: 'Text', value: result.text, updatedAt: new Date().toISOString() },
        logs: [
          {
            time: new Date().toISOString(),
            level: 'info',
            message: `响应成功，耗时 ${(durationMs / 1000).toFixed(1)}s，输出 ${result.text.length} 字符。`,
          },
        ],
      }
    } catch (err) {
      if (signal.aborted) {
        return { success: false, message: '已停止', retryable: false }
      }
      const message = extractErrorMessage(err, '文字模型调用失败')
      return {
        success: false,
        message,
        logs: [{ time: new Date().toISOString(), level: 'error', message: `文字模型调用失败: ${message}` }],
      }
    }
  },
}

export default textAi
