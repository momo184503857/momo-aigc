import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { canvasApi } from '@/services/canvasApi'
import { DEFAULT_TEXT_MODEL } from '@/types/adapter'

function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.id === 'string' && typeof asset.fileName === 'string' && typeof asset.localPath === 'string' && typeof asset.previewUrl === 'string'
}

/**
 * 从图片输入端口提取可访问的图片 URL（http(s) 直链或 data: base64）。
 * 上游（image-input / image-ai）的 result.value 结构为 { image, imageList }。
 */
function extractImageUrls(imageInput: unknown): string[] {
  if (!imageInput || typeof imageInput !== 'object') return []
  const value = (imageInput as { result?: { value?: unknown } }).result?.value
  if (!value || typeof value !== 'object') return []
  const obj = value as Record<string, unknown>
  const assets: LocalImageAsset[] = []
  if (isLocalImageAsset(obj.image)) assets.push(obj.image)
  if (Array.isArray(obj.imageList)) {
    for (const item of obj.imageList) {
      if (isLocalImageAsset(item) && !assets.includes(item)) assets.push(item)
    }
  }
  const urls: string[] = []
  for (const a of assets) {
    const url = a.previewUrl || a.localPath
    if (typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:'))) urls.push(url)
  }
  return urls
}

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
  defaultConfig: { modelName: DEFAULT_TEXT_MODEL, taskPrompt: '', detailPrompt: '', pauseAfterRun: false, temperature: undefined, maxTokens: undefined },

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

    // 读取图片输入（image-input / image-ai 上游），转成可访问 URL
    const imageUrls = extractImageUrls(inputs.image)

    if (!taskPrompt.trim() && !detailPrompt.trim() && typeof upstreamText !== 'string') {
      return { success: false, message: `节点「${node.title}」缺少有效提示内容或上游输入。` }
    }

    const prompt = ['[Task]', taskPrompt, '', '[Details]', detailPrompt, '', '[Upstream text]', upstreamText ?? ''].join('\n')

    // 有图片时用 OpenAI vision 多模态 content（文字 + 图片），否则纯文本（向后兼容）
    const content = imageUrls.length
      ? ([{ type: 'text', text: prompt }, ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } }))] as Array<Record<string, unknown>>)
      : prompt

    const logs: NodeRunResult['logs'] = [{ level: 'info', message: `请求参数: ${JSON.stringify({ taskPrompt: taskPrompt.slice(0, 200), detailPrompt: detailPrompt.slice(0, 200), hasUpstreamText: typeof upstreamText === 'string', imageCount: imageUrls.length })}` }]
    if (imageUrls.length) logs.push({ level: 'info', message: `附带 ${imageUrls.length} 张参考图发给文字模型。` })

    try {
      const startedAt = Date.now()
      const result = await canvasApi.chat({
        model: modelName || DEFAULT_TEXT_MODEL,
        messages: [{ role: 'user', content }],
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
      // 优先读取后端返回的具体 error（如 ToAPIs 的错误信息），而非 axios 的 "status code 500"
      const axiosErr = err as { response?: { data?: { error?: string } } }
      const message = axiosErr?.response?.data?.error || (err instanceof Error ? err.message : '文字模型调用失败')
      logs.push({ level: 'error', message: `文字模型调用失败: ${message}` })
      return { success: false, message, logs }
    }
  },
}

export default textAi
