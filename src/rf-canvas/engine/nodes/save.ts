import type { NodeRunResult, NodeModule } from './types'
import type { AssetEntry, ImageAsset, ImageNodeValue, LogEntry, PortDef, RFFlowNode } from '../../types'

function isImageNodeValue(value: unknown): value is ImageNodeValue {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as Record<string, unknown>).imageList)
}

const save: NodeModule = {
  type: 'save',
  title: '保存',
  description: '收集上游图片/文本写入本项目「成果面板」。',
  getInputs: (): PortDef[] => [
    { id: 'image', name: 'Image', dataType: 'Image', direction: 'input' },
    { id: 'text', name: 'Text', dataType: 'Text', direction: 'input' },
  ],
  getOutputs: (): PortDef[] => [],
  defaultConfig: {},

  getSummary() {
    return '产出进入成果面板'
  },

  async run({ node, inputs, addAssets }): Promise<NodeRunResult> {
    const title = node.data.title
    const textInput = inputs.text
    const textValue = textInput && typeof textInput.value === 'string' ? textInput.value : undefined

    const imageAssets: ImageAsset[] = []
    const imageInput = inputs.image
    if (isImageNodeValue(imageInput?.value)) {
      for (const asset of imageInput.value.imageList) {
        if (asset?.url) imageAssets.push(asset)
      }
    }

    if (!textValue?.trim() && !imageAssets.length) {
      return { success: false, message: `节点「${title}」缺少输入数据（至少连接图片或文本之一）。`, retryable: false }
    }

    const now = new Date().toISOString()
    const entries: AssetEntry[] = []
    const summaryParts: string[] = []
    const logs: LogEntry[] = []

    if (typeof textValue === 'string' && textValue.trim()) {
      entries.push({
        id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'text',
        text: textValue,
        nodeTitle: title,
        createdAt: now,
      })
      summaryParts.push(`[text] ${textValue.slice(0, 100)}`)
      logs.push({ time: now, level: 'info', message: `文本已收集 (${textValue.length} 字符)` })
    }

    imageAssets.forEach((img, i) => {
      entries.push({
        id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${i}`,
        kind: 'image',
        url: img.url,
        fileName: img.fileName,
        nodeTitle: title,
        createdAt: now,
      })
      summaryParts.push(img.url)
      logs.push({ time: now, level: 'info', message: `图片 ${i + 1}: ${img.fileName}` })
    })

    addAssets(entries)

    return {
      success: true,
      result: { dataType: 'Text', value: summaryParts.join('\n'), updatedAt: now },
      logs,
    }
  },
}

export default save
