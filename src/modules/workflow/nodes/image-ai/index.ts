import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { canvasApi } from '@/services/canvasApi'
import { generateImage } from '@/services/imageGeneration'
import { useModelCatalogStore } from '@/stores/modelCatalog'

function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.id === 'string' && typeof asset.fileName === 'string' && typeof asset.localPath === 'string' && typeof asset.previewUrl === 'string'
}

const imageAi: NodeModule = {
  type: 'image-ai',
  title: '图片 AI',
  description: '调用全局图片模型生成单张图片。',
  icon: 'MagicStick',
  color: '#c32bac',
  inputs: [
    { id: 'prompt', name: 'Prompt', dataType: 'Text', direction: 'input', required: true },
    { id: 'image_1', name: '图1', dataType: 'Image', direction: 'input' },
    { id: 'image_2', name: '图2', dataType: 'Image', direction: 'input' },
    { id: 'image_3', name: '图3', dataType: 'Image', direction: 'input' },
  ],
  outputs: [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'output' }],
  defaultConfig: { modelName: 'gpt-image-2', aspectRatio: '1:1', outputSize: '2K', imageCount: 3 },

  getSummary(config) {
    const model = typeof config.modelName === 'string' ? config.modelName : 'gpt-image-2'
    const ratio = typeof config.aspectRatio === 'string' ? config.aspectRatio : '1:1'
    const size = typeof config.outputSize === 'string' ? config.outputSize : '2K'
    return `${model} · ${ratio} · ${size}`
  },

  async run(workflow, node): Promise<NodeRunResult> {
    const config = node.config
    const modelName = typeof config.modelName === 'string' ? config.modelName : 'gpt-image-2'
    // 优先按数字 id 解析（目录唯一真源）；旧画布存量节点只有模型名时按名兜底，最后退默认模型
    const catalog = useModelCatalogStore()
    await catalog.ensureLoaded()
    const channelModel =
      (typeof config.logicalModelId === 'number' ? catalog.getModel(config.logicalModelId) : undefined) ??
      (modelName ? catalog.getModelByName(modelName) : undefined) ??
      catalog.defaultImageModel
    if (!channelModel) {
      return { success: false, message: '暂无可用生图模型，请联系管理员配置渠道' }
    }
    const aspectRatio = typeof config.aspectRatio === 'string' ? config.aspectRatio : '1:1'
    const outputSize = typeof config.outputSize === 'string' ? config.outputSize : '2K'

    const inputs = resolveNodeInputs(workflow, node.id)
    const promptInput = inputs.prompt
    if (!promptInput || typeof promptInput.result.value !== 'string' || !promptInput.result.value.trim()) {
      return { success: false, message: `节点「${node.title}」缺少有效 Prompt 输入。` }
    }
    const prompt = promptInput.result.value

    // Collect reference images
    const refImages: LocalImageAsset[] = []
    for (const port of node.inputs) {
      if (!port.id.startsWith('image_')) continue
      const input = inputs[port.id]
      if (input && isLocalImageAsset(input.result.value)) {
        refImages.push(input.result.value)
      }
    }

    const logs: NodeRunResult['logs'] = [{ level: 'info', message: `请求参数: ${JSON.stringify({ prompt: prompt.slice(0, 200), imageCount: refImages.length, aspectRatio, outputSize })}` }]

    try {
      const startedAt = Date.now()

      // 构建 refImages 参数（保持顺序）
      const refImagesOrdered: Array<{ url?: string; file?: File }> = []
      for (const img of refImages) {
        const src = img.previewUrl || img.localPath
        if (src.startsWith('http')) {
          refImagesOrdered.push({ url: src })
        } else if (src.startsWith('data:')) {
          logs.push({ level: 'info', message: `准备上传参考图: ${img.fileName}` })
          const blob = await (await fetch(src)).blob()
          const file = new File([blob], img.fileName || 'image.png', { type: blob.type })
          refImagesOrdered.push({ file })
        } else if (src) {
          logs.push({ level: 'warn', message: `未知图片源格式: ${src.slice(0, 50)}...` })
          refImagesOrdered.push({ url: src })
        }
      }

      // 获取生成数量
      const imageCount = typeof config.imageCount === 'number' ? Math.max(1, Math.min(5, config.imageCount)) : 1

      // 调用统一生图函数（提交 + 阻塞轮询；结果转存由服务端完成）
      const result = await generateImage(
        {
          logicalModelId: channelModel.id,
          prompt,
          size: aspectRatio,
          resolution: outputSize,
          refImages: refImagesOrdered,
          featureId: 'canvas',
          n: imageCount,
        },
        {
          poll: { interval: 3000, maxAttempts: 120 },  // 阻塞式轮询，最多 6 分钟
        }
      )

      const durationMs = Date.now() - startedAt
      logs.push({ level: 'info', message: `生图任务已提交，任务号: ${result.taskNo}` })
      window.dispatchEvent(new CustomEvent('canvas:task-created'))

      // 检查结果
      if (!result.pollResult || result.pollResult.status !== 'completed' || !result.resultUrls?.length) {
        const errorMsg = result.pollResult?.errorMessage || '生图失败'
        logs.push({ level: 'error', message: errorMsg })
        return { success: false, message: errorMsg, logs }
      }

      logs.push({ level: 'info', message: `生图完成，耗时 ${(durationMs / 1000).toFixed(1)}s，共 ${result.resultUrls.length} 张图片` })

      // 构建图片资源列表
      const imageList: LocalImageAsset[] = result.resultUrls.map((url, idx) => ({
        id: crypto.randomUUID(),
        fileName: `${result.taskNo || 'canvas'}-${idx + 1}.png`,
        localPath: url,
        previewUrl: url,
      }))

      // Save first image to canvas assets
      const firstImage = imageList[0]
      canvasApi.addAsset({
        fileName: firstImage.fileName,
        filePath: firstImage.localPath,
        previewUrl: firstImage.previewUrl,
        nodeId: node.id,
        nodeTitle: node.title,
        projectId: workflow.id ? Number(workflow.id) : undefined,
      }).catch(() => {})

      return {
        success: true,
        result: { dataType: 'Image', value: { image: firstImage, imageList, taskId: result.taskNo }, updatedAt: new Date().toISOString() },
        logs,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '图片生成失败'
      logs.push({ level: 'error', message: `图片生成失败: ${message}` })
      return { success: false, message, logs }
    }
  },
}

export default imageAi