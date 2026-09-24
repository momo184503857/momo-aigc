import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { collectImageAssets } from '@/modules/workflow/utils/imageAssets'
import { canvasApi } from '@/services/canvasApi'
import { ossApi } from '@/services/ossApi'

const PRESET_RATIOS: Record<string, [number, number]> = {
  '1:1': [1, 1],
  '3:4': [3, 4],
  '4:3': [4, 3],
  '9:16': [9, 16],
  '16:9': [16, 9],
}

/** 解析目标宽高比（custom 用 customW:customH）；非法返回 null */
function resolveTargetRatio(config: Record<string, unknown>): [number, number] | null {
  const ratio = typeof config.ratio === 'string' ? config.ratio : '3:4'
  if (ratio === 'custom') {
    const w = Number(config.customW)
    const h = Number(config.customH)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [w, h]
    return null
  }
  return PRESET_RATIOS[ratio] ?? null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`图片加载失败: ${src.slice(0, 60)}`))
    img.src = src
  })
}

/**
 * 确定性居中裁切：保持较长边不变，两侧等量裁掉较短方向（不做任何缩放/补画）。
 * 对齐 skill 的 crop_square_to_3x4.py 语义——3:4 即高度不变、宽度裁至 75%。
 */
function cropCenter(img: HTMLImageElement, targetRatio: [number, number]): HTMLCanvasElement {
  const [rw, rh] = targetRatio
  const srcW = img.naturalWidth
  const srcH = img.naturalHeight
  const srcRatio = srcW / srcH
  let cropW: number
  let cropH: number
  if (srcRatio > rw / rh) {
    // 原图更宽：高度不变，左右等量裁
    cropH = srcH
    cropW = Math.floor(srcH * (rw / rh))
  } else {
    // 原图更高：宽度不变，上下等量裁
    cropW = srcW
    cropH = Math.floor(srcW * (rh / rw))
  }
  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布上下文')
  const offsetX = Math.floor((srcW - cropW) / 2)
  const offsetY = Math.floor((srcH - cropH) / 2)
  ctx.drawImage(img, offsetX, offsetY, cropW, cropH, 0, 0, cropW, cropH)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('画布导出 PNG 失败'))
    }, 'image/png')
  })
}

const imageCrop: NodeModule = {
  type: 'image-crop',
  title: '图片裁剪',
  description: '确定性居中裁切到目标比例（不缩放、不用 AI 重绘）。',
  icon: 'Crop',
  color: 'var(--warning)',
  inputs: [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'input', required: true }],
  outputs: [{ id: 'image', name: 'Image', dataType: 'Image', direction: 'output' }],
  defaultConfig: { ratio: '3:4' },

  getSummary(config) {
    if (config.ratio === 'custom') {
      const w = typeof config.customW === 'number' ? config.customW : '?'
      const h = typeof config.customH === 'number' ? config.customH : '?'
      return `自定义 ${w}:${h}`
    }
    return `比例 ${typeof config.ratio === 'string' ? config.ratio : '3:4'}`
  },

  async run(workflow, node): Promise<NodeRunResult> {
    const targetRatio = resolveTargetRatio(node.config)
    if (!targetRatio) {
      return { success: false, message: `节点「${node.title}」裁剪比例配置无效。` }
    }

    const inputs = resolveNodeInputs(workflow, node.id)
    const assets = collectImageAssets(inputs.image?.result.value)
    if (!assets.length) {
      return { success: false, message: `节点「${node.title}」缺少 Image 输入。` }
    }

    const logs: NodeRunResult['logs'] = []
    const outAssets: LocalImageAsset[] = []

    try {
      for (const asset of assets) {
        const src = asset.previewUrl || asset.localPath
        const img = await loadImage(src)
        const cropped = cropCenter(img, targetRatio)
        const blob = await canvasToBlob(cropped)
        const baseName = asset.fileName.replace(/\.[^.]+$/, '') || 'image'
        const file = new File([blob], `${baseName}_${targetRatio[0]}x${targetRatio[1]}.png`, {
          type: 'image/png',
        })
        const uploaded = await ossApi.upload(file, 'inputs')
        const outAsset: LocalImageAsset = {
          id: crypto.randomUUID(),
          fileName: file.name,
          localPath: uploaded.publicUrl,
          previewUrl: uploaded.publicUrl,
          width: cropped.width,
          height: cropped.height,
        }
        outAssets.push(outAsset)
        logs.push({
          level: 'info',
          message: `已裁切 ${asset.fileName}: ${img.naturalWidth}×${img.naturalHeight} → ${cropped.width}×${cropped.height}（${targetRatio[0]}:${targetRatio[1]}）`,
        })
        canvasApi
          .addAsset({
            fileName: outAsset.fileName,
            filePath: outAsset.localPath,
            previewUrl: outAsset.previewUrl,
            nodeId: node.id,
            nodeTitle: node.title,
            projectId: workflow.id ? Number(workflow.id) : undefined,
          })
          .catch(() => {})
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '图片裁剪失败'
      logs.push({ level: 'error', message })
      return { success: false, message, logs }
    }

    return {
      success: true,
      result: {
        dataType: 'Image',
        value: { image: outAssets[0], imageList: outAssets },
        updatedAt: new Date().toISOString(),
      },
      logs,
    }
  },
}

export default imageCrop
