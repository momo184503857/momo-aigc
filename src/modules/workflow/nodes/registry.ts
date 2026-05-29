/**
 * 节点注册表 — 自动收集所有节点模块
 */
import type { Component } from 'vue'
import type { NodeModule } from '@/modules/workflow/nodes/types'
import textInput from '@/modules/workflow/nodes/text-input'
import imageInput from '@/modules/workflow/nodes/image-input'
import textPreview from '@/modules/workflow/nodes/text-preview'
import imagePreview from '@/modules/workflow/nodes/image-preview'
import textAi from '@/modules/workflow/nodes/text-ai'
import imageAi from '@/modules/workflow/nodes/image-ai'
import promptSplitter from '@/modules/workflow/nodes/prompt-splitter'
import save from '@/modules/workflow/nodes/save'

import TextInputConfig from '@/modules/workflow/nodes/text-input/ConfigPanel.vue'
import ImageInputConfig from '@/modules/workflow/nodes/image-input/ConfigPanel.vue'
import TextPreviewConfig from '@/modules/workflow/nodes/text-preview/ConfigPanel.vue'
import ImagePreviewConfig from '@/modules/workflow/nodes/image-preview/ConfigPanel.vue'
import TextAiConfig from '@/modules/workflow/nodes/text-ai/ConfigPanel.vue'
import ImageAiConfig from '@/modules/workflow/nodes/image-ai/ConfigPanel.vue'
import PromptSplitterConfig from '@/modules/workflow/nodes/prompt-splitter/ConfigPanel.vue'
import SaveConfig from '@/modules/workflow/nodes/save/ConfigPanel.vue'

const modules: NodeModule[] = [
  textInput,
  imageInput,
  textPreview,
  imagePreview,
  textAi,
  imageAi,
  promptSplitter,
  save,
]

const registry = new Map<string, NodeModule>()
for (const mod of modules) {
  registry.set(mod.type, mod)
}

const configPanels: Record<string, Component> = {
  'text-input': TextInputConfig,
  'image-input': ImageInputConfig,
  'text-preview': TextPreviewConfig,
  'image-preview': ImagePreviewConfig,
  'text-ai': TextAiConfig,
  'image-ai': ImageAiConfig,
  'prompt-splitter': PromptSplitterConfig,
  'save': SaveConfig,
}

/** 获取指定类型的节点模块 */
export function getNodeModule(type: string): NodeModule | undefined {
  return registry.get(type)
}

/** 获取所有节点模块（用于新增节点菜单） */
export function getAllNodeModules(): NodeModule[] {
  return modules
}

/** 获取节点配置面板组件 */
export function getConfigPanel(type: string): Component | undefined {
  return configPanels[type]
}
