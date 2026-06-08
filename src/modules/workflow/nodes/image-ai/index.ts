import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'
import type { ModelId } from '@/types/adapter'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { toapisProxyApi } from '@/services/toapisProxyApi'
import { canvasApi } from '@/services/canvasApi'
import { taskApi } from '@/services/taskApi'
import { generateImage } from '@/services/imageGeneration'
import { ossApi } from '@/services/ossApi'

function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.id === 'string' && typeof asset.fileName === 'string' && typeof asset.localPath === 'string' && typeof asset.previewUrl === 'string'
}

const POLL_INTERVAL = 3000
const MAX_POLL_ATTEMPTS = 120

async function pollTaskResult(taskId: string): Promise<{ success: boolean; imageUrls: string[]; error?: string }> {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    try {
      const status = await toapisProxyApi.getTaskStatus(taskId)
      const data = status.data.data
      if (data.status === 'completed' && data.resultUrls?.length > 0) {
        return { success: true, imageUrls: data.resultUrls }
      }
      if (data.status === 'failed') {
        return { success: false, imageUrls: [], error: data.errorMessage || '生图任务失败' }
      }
    } catch (err: unknown) {
      return { success: false, imageUrls: [], error: err instanceof Error ? err.message : '轮询任务状态失败' }
    }
  }
  return { success: false, imageUrls: [], error: '轮询超时' }
}

const imageAi: NodeModule = {
  type: 'image-ai',
  title: '图片 AI',
  description: '调用全局图片模型生成单张图片。',
  icon: 'MagicStick',
  color: '#E040A0',
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

      // 构建 refImages 参数（保持顺序，优先使用新参数）
      const refImagesOrdered: Array<{ url?: string; file?: File }> = []
      for (const img of refImages) {
        const src = img.previewUrl || img.localPath
        if (src.startsWith('http')) {
          // 已上传的 URL（可能是 OSS 或其他）
          refImagesOrdered.push({ url: src })
        } else if (src.startsWith('data:')) {
          // data URL → 转 File 后上传
          logs.push({ level: 'info', message: `准备上传参考图: ${img.fileName}` })
          const blob = await (await fetch(src)).blob()
          const file = new File([blob], img.fileName || 'image.png', { type: blob.type })
          refImagesOrdered.push({ file })
        } else if (src) {
          // 其他情况（如本地文件路径）→ 尝试作为 URL 处理
          logs.push({ level: 'warn', message: `未知图片源格式: ${src.slice(0, 50)}...` })
          refImagesOrdered.push({ url: src })
        }
      }

      // 获取生成数量
      const imageCount = typeof config.imageCount === 'number' ? Math.max(1, Math.min(5, config.imageCount)) : 1

      // 调用统一的生图函数（使用 refImages 新参数）
      const result = await generateImage({
        model: modelName as ModelId,
        prompt,
        size: aspectRatio,
        resolution: outputSize,
        refImages: refImagesOrdered,
        featureId: 'canvas',
        n: imageCount,
      })

      const taskId = result.toapisTaskId
      const dbTaskId = result.dbTaskId
      logs.push({ level: 'info', message: `生图任务已提交，Task ID: ${taskId}` })
      window.dispatchEvent(new CustomEvent('canvas:task-created'))

      // Poll for result
      const pollResult = await pollTaskResult(taskId)
      const durationMs = Date.now() - startedAt

      if (!pollResult.success || pollResult.imageUrls.length === 0) {
        logs.push({ level: 'error', message: pollResult.error || '生图失败' })
        if (dbTaskId) {
          taskApi.update(dbTaskId, { status: 'failed', error_message: pollResult.error }).catch(() => {})
        }
        return { success: false, message: pollResult.error || `节点「${node.title}」图片生成失败。`, logs }
      }

      logs.push({ level: 'info', message: `生图完成，耗时 ${(durationMs / 1000).toFixed(1)}s，共 ${pollResult.imageUrls.length} 张图片` })

      // 转存所有结果图到 OSS
      const importedUrls: string[] = []
      for (let i = 0; i < pollResult.imageUrls.length; i++) {
        const srcUrl = pollResult.imageUrls[i]
        try {
          const imported = await ossApi.importResult(taskId, srcUrl)
          importedUrls.push(imported.publicUrl)
          logs.push({ level: 'info', message: `图片 ${i + 1}/${pollResult.imageUrls.length} 已转存到 OSS` })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          logs.push({ level: 'error', message: `图片 ${i + 1} 转存 OSS 失败: ${errMsg}` })
        }
      }

      if (importedUrls.length === 0) {
        const message = '所有结果图转存 OSS 失败'
        logs.push({ level: 'error', message })
        if (dbTaskId) {
          taskApi.update(dbTaskId, {
            status: 'completed',
            progress: 100,
            result_image_urls: [],
            error_message: '结果转存 OSS 失败，请重试',
          }).catch(() => {})
        }
        return { success: false, message, logs }
      }

      // 构建图片资源列表
      const imageList: LocalImageAsset[] = importedUrls.map((url, idx) => ({
        id: crypto.randomUUID(),
        fileName: `${taskId || 'generated'}-${idx + 1}.png`,
        localPath: url,
        previewUrl: url,
      }))

      // Update DB task as completed
      if (dbTaskId) {
        taskApi.update(dbTaskId, {
          status: 'completed',
          progress: 100,
          result_image_urls: importedUrls,
          completed_at: new Date().toISOString(),
        }).catch(() => {})
      }

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
        result: { dataType: 'Image', value: { image: firstImage, imageList, taskId }, updatedAt: new Date().toISOString() },
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
