/**
 * 节点注册表：type → NodeModule 单一来源（端口/默认配置/运行逻辑）。
 * 连线校验与端口渲染都从这里取定义。
 */
import type { NodeType, PortDef, RFFlowNode } from '../../types'
import type { GraphSnapshot } from '../graph'
import type { NodeModule } from './types'
import textInput from './text-input'
import imageInput from './image-input'
import textAi from './text-ai'
import promptSplitter from './prompt-splitter'
import imageAi from './image-ai'
import textPreview from './text-preview'
import imagePreview from './image-preview'
import save from './save'

const modules: Record<NodeType, NodeModule> = {
  'text-input': textInput,
  'image-input': imageInput,
  'text-ai': textAi,
  'prompt-splitter': promptSplitter,
  'image-ai': imageAi,
  'text-preview': textPreview,
  'image-preview': imagePreview,
  save,
}

export function getNodeModule(type: string): NodeModule | undefined {
  return modules[type as NodeType]
}

export function getNodeInputs(node: RFFlowNode, graph: GraphSnapshot): PortDef[] {
  const mod = getNodeModule(node.type ?? '')
  return mod ? mod.getInputs(node, graph) : []
}

export function getNodeOutputs(node: RFFlowNode): PortDef[] {
  const mod = getNodeModule(node.type ?? '')
  return mod ? mod.getOutputs(node) : []
}

export function findPort(ports: PortDef[], portId: string): PortDef | undefined {
  return ports.find((p) => p.id === portId)
}

export const NODE_ORDER: NodeType[] = [
  'text-input',
  'image-input',
  'text-ai',
  'prompt-splitter',
  'image-ai',
  'text-preview',
  'image-preview',
  'save',
]

export function nodeTitle(type: string): string {
  return getNodeModule(type)?.title ?? type
}
