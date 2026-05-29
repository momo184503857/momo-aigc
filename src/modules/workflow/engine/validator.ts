import type {
  NodePort,
  ValidationResult,
  WorkflowEdge,
  WorkflowModel,
  WorkflowNode,
} from '@/modules/workflow/types/workflow'

const success = (): ValidationResult => ({ valid: true })

const failure = (message: string): ValidationResult => ({ valid: false, message })

export const canConnectPorts = (sourcePort: NodePort, targetPort: NodePort): ValidationResult => {
  if (sourcePort.direction !== 'output') {
    return failure('连接失败：起点必须是输出端口。')
  }

  if (targetPort.direction !== 'input') {
    return failure('连接失败：终点必须是输入端口。')
  }

  if (
    sourcePort.dataType !== targetPort.dataType &&
    sourcePort.dataType !== 'Any' &&
    targetPort.dataType !== 'Any'
  ) {
    return failure(
      `连接失败：输出类型 ${sourcePort.dataType} 不能连接到输入类型 ${targetPort.dataType}。`
    )
  }

  return success()
}

export const canAddEdge = (
  edge: WorkflowEdge,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult => {
  const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId)
  const targetNode = nodes.find((node) => node.id === edge.targetNodeId)
  const sourcePort = sourceNode?.outputs.find((port) => port.id === edge.sourcePortId)
  const targetPort = targetNode?.inputs.find((port) => port.id === edge.targetPortId)

  if (!sourceNode || !targetNode || !sourcePort || !targetPort) {
    return failure('连接失败：端口不存在。')
  }

  const portResult = canConnectPorts(sourcePort, targetPort)
  if (!portResult.valid) {
    return portResult
  }

  const inputOccupied = edges.some(
    (existingEdge) =>
      existingEdge.targetNodeId === edge.targetNodeId &&
      existingEdge.targetPortId === edge.targetPortId
  )

  if (inputOccupied) {
    return failure('该输入端口已有连接，请先删除原连接。')
  }

  return success()
}

export const validateWorkflowFrame = (
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult => {
  for (const edge of edges) {
    const result = canAddEdge(
      edge,
      nodes,
      edges.filter((item) => item.id !== edge.id)
    )

    if (!result.valid) {
      return result
    }
  }

  return success()
}

// ========== Cycle Detection (Kahn's algorithm) ==========

export const detectCycles = (nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] => {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const inDegree: Record<string, number> = {}
  const adjacency: Record<string, string[]> = {}

  for (const nodeId of nodeIds) {
    inDegree[nodeId] = 0
    adjacency[nodeId] = []
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue
    adjacency[edge.sourceNodeId].push(edge.targetNodeId)
    inDegree[edge.targetNodeId] = (inDegree[edge.targetNodeId] ?? 0) + 1
  }

  const queue: string[] = []
  for (const nodeId of nodeIds) {
    if (inDegree[nodeId] === 0) {
      queue.push(nodeId)
    }
  }

  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    visited.add(current)
    for (const neighbor of adjacency[current]) {
      inDegree[neighbor]--
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor)
      }
    }
  }

  return [...nodeIds].filter((id) => !visited.has(id))
}

// ========== Execution Validation ==========

export const validateWorkflowExecution = (
  workflow: WorkflowModel,
  nodeIds?: string[]
): ValidationResult => {
  const targetNodes = nodeIds
    ? workflow.nodes.filter((n) => nodeIds.includes(n.id))
    : workflow.nodes

  // 1. Cycle detection
  const cycles = detectCycles(workflow.nodes, workflow.edges)
  if (cycles.length > 0) {
    const cycleNames = cycles
      .map((id) => workflow.nodes.find((n) => n.id === id)?.title ?? id)
      .join('、')
    return failure(`运行失败：工作流存在循环依赖，涉及节点：${cycleNames}。`)
  }

  // 2. Per-node validation for nodes that will run
  for (const node of targetNodes) {
    if (node.disabled) continue

    const connectedInputPorts = new Set(
      workflow.edges.filter((e) => e.targetNodeId === node.id).map((e) => e.targetPortId)
    )

    for (const input of node.inputs) {
      if (input.required && !connectedInputPorts.has(input.id)) {
        return failure(`运行失败：节点「${node.title}」缺少必填输入「${input.name}」。`)
      }
    }

    switch (node.type) {
      case 'text-ai': {
        const taskPrompt = node.config.taskPrompt as string | undefined
        const detailPrompt = node.config.detailPrompt as string | undefined
        const hasUpstream = connectedInputPorts.has('text')
        if (
          (!taskPrompt || !taskPrompt.trim()) &&
          (!detailPrompt || !detailPrompt.trim()) &&
          !hasUpstream
        ) {
          return failure(`运行失败：文字 AI 节点「${node.title}」缺少有效提示内容或上游输入。`)
        }
        break
      }

      case 'image-ai': {
        const promptConnected = connectedInputPorts.has('prompt')
        if (!promptConnected) {
          return failure(`运行失败：图片 AI 节点「${node.title}」缺少 Prompt 输入。`)
        }
        if (!node.config.aspectRatio) {
          return failure(`运行失败：图片 AI 节点「${node.title}」未设置输出比例。`)
        }
        if (!node.config.outputSize) {
          return failure(`运行失败：图片 AI 节点「${node.title}」未设置输出尺寸。`)
        }
        break
      }

      case 'prompt-splitter': {
        if (!node.config.delimiter) {
          return failure(`运行失败：提示词拆分节点「${node.title}」未设置分隔符。`)
        }
        if (!connectedInputPorts.has('text')) {
          return failure(`运行失败：提示词拆分节点「${node.title}」缺少 Text 输入。`)
        }
        break
      }

      case 'save': {
        const hasAnyInput = connectedInputPorts.size > 0
        if (!hasAnyInput) {
          return failure(`运行失败：保存节点「${node.title}」至少需要一个输入。`)
        }
        break
      }

      default:
        break
    }
  }

  return success()
}
