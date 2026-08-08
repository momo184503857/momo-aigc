/**
 * 节点定义查找 — 委托给模块化注册表
 */
import type { NodeDefinition, NodeType } from '@/modules/workflow/types/workflow'
import { getNodeModule, getAllNodeModules } from '@/modules/workflow/nodes/registry'

export const getNodeDefinition = (type: NodeType): NodeDefinition => {
  const mod = getNodeModule(type)
  if (!mod) {
    return { type, title: type, description: '', inputs: [], outputs: [], defaultConfig: {} }
  }
  return {
    type: mod.type as NodeType,
    title: mod.title,
    description: mod.description,
    inputs: mod.inputs,
    outputs: mod.outputs,
    defaultConfig: mod.defaultConfig,
  }
}

export const getNodeDefinitions = (): NodeDefinition[] => {
  return getAllNodeModules().map((mod) => ({
    type: mod.type as NodeType,
    title: mod.title,
    description: mod.description,
    inputs: mod.inputs,
    outputs: mod.outputs,
    defaultConfig: mod.defaultConfig,
  }))
}

/** 获取节点类型对应的图标名和主题色 */
export const getNodeTheme = (type: string): { icon: string; color: string } => {
  const mod = getNodeModule(type)
  return { icon: mod?.icon ?? 'Setting', color: mod?.color ?? '#86909c' }
}

/** 获取节点配置摘要 */
export const getNodeSummary = (type: string, config: Record<string, unknown>): string => {
  const mod = getNodeModule(type)
  return mod?.getSummary(config) ?? ''
}
