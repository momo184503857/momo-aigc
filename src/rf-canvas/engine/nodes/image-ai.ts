import type { NodeRunResult, NodeModule } from './types'
import type { ImageAsset, ImageAiConfig, ImageNodeValue, PortDef, RFFlowNode } from '../../types'
import { generateImage, extractErrorMessage } from '../../api'
import { getCachedImageCatalog } from '../../catalogSync'

function isImageNodeValue(value: unknown): value is ImageNodeValue {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as Record<string, unknown>).imageList)
}

/** 所选逻辑模型的参考图上限（目录已加载时取真实值，未加载回退 14） */
function maxRefImages(node: RFFlowNode): number {
  const logicalModelId = node.data.config.logicalModelId
  if (typeof logicalModelId === 'number') {
    const model = getCachedImageCatalog().find((m) => m.id === logicalModelId)
    if (model?.capabilities?.maxReferenceImages) return model.capabilities.maxReferenceImages
  }
  return 14
}

/** image_N 输入端口：动态=已连参考图数（+1 空位供继续连接），上限=模型 maxReferenceImages */
export function imageAiInputPorts(node: RFFlowNode, graph: { edges: { target: string; targetHandle?: string | null }[] }): PortDef[] {
  const connected = graph.edges.filter(
    (e) => e.target === node.id && typeof e.targetHandle === 'string' && e.targetHandle.startsWith('image_')
  ).length
  const cap = maxRefImages(node)
  const count = Math.min(cap, Math.max(1, connected + 1))
  const ports: PortDef[] = [
    { id: 'prompt', name: 'Prompt', dataType: 'Text', direction: 'input', required: true },
  ]
  for (let i = 1; i <= count; i++) {
    ports.push({ id: `image_${i}`, name: `图${i}`, dataType: 'Image', direction: 'input' })
  }
  return ports
}

const imageAi: NodeModule = {
  type: 'image-ai',
  title: '图片 AI',
  description: '走主站统一生图（预扣积分、失败自动退款）。',
  getInputs: imageAiInputPorts,
  getOutputs: (): PortDef[] => [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'output' }],
  defaultConfig: {
    logicalModelId: null,
    aspectRatio: '',
    resolution: '',
    n: 1,
  } satisfies ImageAiConfig,

  getSummary(node: RFFlowNode) {
    const config = node.data.config
    const modelSelected = typeof config.logicalModelId === 'number'
    const ratio = typeof config.aspectRatio === 'string' ? config.aspectRatio : ''
    const res = typeof config.resolution === 'string' ? config.resolution : ''
    const n = typeof config.n === 'number' ? config.n : 1
    if (!modelSelected) return '未选模型'
    return `${ratio || '?'} · ${res || '?'} · ${n} 张`
  },

  async run({ node, inputs, signal, addLog }): Promise<NodeRunResult> {
    const config = node.data.config
    const title = node.data.title
    const logicalModelId = config.logicalModelId
    if (typeof logicalModelId !== 'number' || !logicalModelId) {
      return { success: false, message: `节点「${title}」未选择生图模型。`, retryable: false }
    }

    const promptInput = inputs.prompt
    if (!promptInput || typeof promptInput.value !== 'string' || !promptInput.value.trim()) {
      return { success: false, message: `节点「${title}」缺少有效 Prompt 输入。`, retryable: false }
    }
    const prompt = promptInput.value

    const aspectRatio = typeof config.aspectRatio === 'string' ? config.aspectRatio : ''
    const resolution = typeof config.resolution === 'string' ? config.resolution : ''
    if (!aspectRatio || !resolution) {
      return { success: false, message: `节点「${title}」未设置宽高比或分辨率。`, retryable: false }
    }

    const n = typeof config.n === 'number' ? Math.max(1, Math.min(5, Math.round(config.n))) : 1

    // 收集参考图（image_1..N 顺序）
    const refImageUrls: string[] = []
    const imagePorts = Object.keys(inputs).filter((k) => k.startsWith('image_')).sort((a, b) => {
      const na = Number(a.slice(6))
      const nb = Number(b.slice(6))
      return na - nb
    })
    for (const port of imagePorts) {
      const value = inputs[port]?.value
      if (isImageNodeValue(value)) {
        for (const asset of value.imageList as ImageAsset[]) {
          if (typeof asset?.url === 'string' && asset.url) refImageUrls.push(asset.url)
        }
      }
    }

    addLog('info', `请求参数: ${JSON.stringify({ prompt: prompt.slice(0, 200), refImages: refImageUrls.length, aspectRatio, resolution, n })}`)

    const startedAt = Date.now()
    try {
      const result = await generateImage({
        logicalModelId,
        prompt,
        aspectRatio,
        resolution,
        refImageUrls,
        n,
        signal,
      })

      if (result.status !== 'completed' || !result.resultUrls.length) {
        return {
          success: false,
          message: result.errorMessage || '生图失败',
          logs: [
            { time: new Date().toISOString(), level: 'info', message: `生图任务已提交，任务号: ${result.taskNo}` },
            { time: new Date().toISOString(), level: 'error', message: result.errorMessage || '生图失败' },
          ],
        }
      }

      const durationMs = Date.now() - startedAt
      const imageList: ImageAsset[] = result.resultUrls.map((url, idx) => ({
        url,
        fileName: `${result.taskNo || 'rf-canvas'}-${idx + 1}.png`,
      }))

      return {
        success: true,
        result: {
          dataType: 'Image',
          value: { imageList, taskNo: result.taskNo },
          updatedAt: new Date().toISOString(),
        },
        logs: [
          { time: new Date().toISOString(), level: 'info', message: `生图任务已提交，任务号: ${result.taskNo}` },
          {
            time: new Date().toISOString(),
            level: 'info',
            message: `生图完成，耗时 ${(durationMs / 1000).toFixed(1)}s，共 ${result.resultUrls.length} 张图片（失败自动退款由服务端处理）。`,
          },
        ],
      }
    } catch (err) {
      if (signal.aborted) {
        return { success: false, message: '已停止', retryable: false }
      }
      // 402 余额不足等确定性失败不重试（重试也不会成功）
      const status = (err as { response?: { status?: number } })?.response?.status
      const message = extractErrorMessage(err, '图片生成失败')
      return {
        success: false,
        message,
        retryable: status === 402 || status === 400 || status === 404 ? false : undefined,
        logs: [{ time: new Date().toISOString(), level: 'error', message: `图片生成失败: ${message}` }],
      }
    }
  },
}

export default imageAi
