/**
 * 节点运行器 — 委托给各节点模块的 run 方法
 */
import type {
  NodeResult,
  WorkflowInputValue,
  WorkflowModel,
  WorkflowNode,
} from '@/modules/workflow/types/workflow'
import { getNodeModule } from '@/modules/workflow/nodes/registry'
import type { NodeRunResult } from '@/modules/workflow/nodes/types'

export type { NodeRunSuccess, NodeRunFailure, NodeRunResult } from '@/modules/workflow/nodes/types'

export const resolveNodeInputs = (
  workflow: WorkflowModel,
  nodeId: string
): Record<string, WorkflowInputValue> => {
  const targetEdges = workflow.edges.filter((edge) => edge.targetNodeId === nodeId)
  const inputMap: Record<string, WorkflowInputValue> = {}

  for (const edge of targetEdges) {
    const sourceNode = workflow.nodes.find((node) => node.id === edge.sourceNodeId)
    if (!sourceNode?.result) continue

    // 多输出口节点（如 prompt-splitter）的 result.value 是 Record<portId, value>：
    // 按连线上的 sourcePortId 取对应输出口的值，下游拿到的永远是单口值。
    // 判定收紧为「value 的 key 集合与上游输出口 id 集合完全一致」，避免把
    // image-input/image-ai 的 {image, imageList, taskId} 包装误当多口映射解包成单张。
    let value = sourceNode.result.value
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value as Record<string, unknown>)
      const portIds = new Set(sourceNode.outputs.map((port) => port.id))
      const isPortMap = keys.length > 0 && keys.every((key) => portIds.has(key))
      if (isPortMap) {
        value = (value as Record<string, unknown>)[edge.sourcePortId]
      }
    }

    inputMap[edge.targetPortId] = {
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
      result: { ...sourceNode.result, value },
    }
  }

  return inputMap
}

export const runBasicNode = async (
  workflow: WorkflowModel,
  node: WorkflowNode
): Promise<NodeRunResult> => {
  if (node.disabled) {
    return { success: false, message: `节点「${node.title}」已禁用。` }
  }

  const mod = getNodeModule(node.type)
  if (!mod) {
    return { success: false, message: `节点「${node.title}」尚未实现运行逻辑。` }
  }

  return mod.run(workflow, node, node.config)
}
