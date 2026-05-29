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

    inputMap[edge.targetPortId] = {
      sourceNodeId: edge.sourceNodeId,
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
      result: sourceNode.result,
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
