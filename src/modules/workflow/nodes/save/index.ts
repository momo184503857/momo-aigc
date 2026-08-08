import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { canvasApi } from '@/services/canvasApi'

function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.id === 'string' && typeof asset.fileName === 'string' && typeof asset.localPath === 'string' && typeof asset.previewUrl === 'string'
}

const save: NodeModule = {
  type: 'save',
  title: '保存',
  description: '保存上游图片或文本到任务文件夹。',
  icon: 'FolderAdd',
  color: '#31c19e',
  inputs: [
    { id: 'image_1', name: '图1', dataType: 'Image', direction: 'input' },
    { id: 'image_2', name: '图2', dataType: 'Image', direction: 'input' },
    { id: 'image_3', name: '图3', dataType: 'Image', direction: 'input' },
    { id: 'image_4', name: '图4', dataType: 'Image', direction: 'input' },
    { id: 'image_5', name: '图5', dataType: 'Image', direction: 'input' },
    { id: 'text', name: 'Text', dataType: 'Text', direction: 'input' },
  ],
  outputs: [{ id: 'path', name: '保存路径', dataType: 'Text', direction: 'output' }],
  defaultConfig: { saveDir: '' },

  getSummary(config) {
    const dir = typeof config.saveDir === 'string' && config.saveDir ? config.saveDir : '未设置目录'
    return dir
  },

  async run(workflow, node): Promise<NodeRunResult> {
    const inputs = resolveNodeInputs(workflow, node.id)

    const textInput = inputs.text
    const textValue = textInput && typeof textInput.result.value === 'string' ? textInput.result.value : undefined

    const imageAssets: LocalImageAsset[] = []
    for (let i = 1; i <= 5; i++) {
      const input = inputs[`image_${i}`]
      if (input && isLocalImageAsset(input.result.value)) {
        imageAssets.push(input.result.value)
      }
    }

    if (!textValue && !imageAssets.length) {
      return { success: false, message: `节点「${node.title}」缺少输入数据。` }
    }

    const savedPaths: string[] = []
    const logs: NodeRunResult['logs'] = []

    if (typeof textValue === 'string' && textValue.trim()) {
      savedPaths.push(`[text] ${textValue.slice(0, 100)}...`)
      logs.push({ level: 'info', message: `文本已记录 (${textValue.length} 字符)` })
    }

    for (let i = 0; i < imageAssets.length; i++) {
      const img = imageAssets[i]
      savedPaths.push(img.previewUrl || img.localPath)
      logs.push({ level: 'info', message: `图片 ${i + 1}: ${img.fileName}` })
      canvasApi.addAsset({
        fileName: img.fileName,
        filePath: img.localPath,
        previewUrl: img.previewUrl,
        nodeId: node.id,
        nodeTitle: node.title,
        projectId: workflow.id ? Number(workflow.id) : undefined,
      }).catch(() => {})
    }

    return {
      success: true,
      result: { dataType: 'Text', value: savedPaths.join('\n'), updatedAt: new Date().toISOString() },
      logs,
    }
  },
}

export default save
