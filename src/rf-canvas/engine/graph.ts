/**
 * 图算法（自旧画布 engine/executor.ts / validator.ts / basicRunner.ts 移植，D4）。
 * 数据结构从 WorkflowModel 换 GraphJSON：edges 的 sourceHandle/targetHandle 即旧 sourcePortId/targetPortId。
 */
import type { RFFlowEdge, RFFlowNode } from '../types'

export interface GraphSnapshot {
  nodes: RFFlowNode[]
  edges: RFFlowEdge[]
}

/** Kahn 拓扑分层（层内可并行、层间顺序） */
export function topologicalSort(nodes: RFFlowNode[], edges: RFFlowEdge[]): string[][] {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const inDegree: Record<string, number> = {}
  const adjacency: Record<string, string[]> = {}

  for (const id of nodeIds) {
    inDegree[id] = 0
    adjacency[id] = []
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    adjacency[edge.source].push(edge.target)
    inDegree[edge.target]++
  }

  const levels: string[][] = []
  let currentLevel = [...nodeIds].filter((id) => inDegree[id] === 0)
  const processed = new Set<string>()

  while (currentLevel.length > 0) {
    levels.push([...currentLevel])
    const nextLevel: string[] = []
    for (const nodeId of currentLevel) {
      processed.add(nodeId)
      for (const neighbor of adjacency[nodeId]) {
        inDegree[neighbor]--
        if (inDegree[neighbor] === 0 && !processed.has(neighbor)) {
          nextLevel.push(neighbor)
        }
      }
    }
    currentLevel = nextLevel
  }
  return levels
}

export function findAncestors(nodeId: string, nodes: RFFlowNode[], edges: RFFlowEdge[]): Set<string> {
  const reverseAdj: Record<string, string[]> = {}
  for (const node of nodes) reverseAdj[node.id] = []
  for (const edge of edges) {
    if (reverseAdj[edge.target]) reverseAdj[edge.target].push(edge.source)
  }
  const ancestors = new Set<string>()
  const queue = [nodeId]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const parent of reverseAdj[current] || []) {
      ancestors.add(parent)
      queue.push(parent)
    }
  }
  return ancestors
}

export function findDescendants(nodeId: string, nodes: RFFlowNode[], edges: RFFlowEdge[]): Set<string> {
  const adjacency: Record<string, string[]> = {}
  for (const node of nodes) adjacency[node.id] = []
  for (const edge of edges) {
    if (adjacency[edge.source]) adjacency[edge.source].push(edge.target)
  }
  const descendants = new Set<string>()
  const queue = [nodeId]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const child of adjacency[current] || []) {
      descendants.add(child)
      queue.push(child)
    }
  }
  return descendants
}

/** 成环节点 id 列表（Kahn 未访问到者即处于环中） */
export function detectCycles(nodes: RFFlowNode[], edges: RFFlowEdge[]): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const inDegree: Record<string, number> = {}
  const adjacency: Record<string, string[]> = {}
  for (const nodeId of nodeIds) {
    inDegree[nodeId] = 0
    adjacency[nodeId] = []
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    adjacency[edge.source].push(edge.target)
    inDegree[edge.target] = (inDegree[edge.target] ?? 0) + 1
  }
  const queue = [...nodeIds].filter((id) => inDegree[id] === 0)
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    visited.add(current)
    for (const neighbor of adjacency[current]) {
      inDegree[neighbor]--
      if (inDegree[neighbor] === 0) queue.push(neighbor)
    }
  }
  return [...nodeIds].filter((id) => !visited.has(id))
}

/** 追加一条边是否成环（连线即时拒绝用，R3.2） */
export function wouldCreateCycle(edges: RFFlowEdge[], candidate: { source: string; target: string }): boolean {
  if (candidate.source === candidate.target) return true
  const adjacency: Record<string, string[]> = {}
  for (const edge of edges) {
    ;(adjacency[edge.source] ??= []).push(edge.target)
  }
  ;(adjacency[candidate.source] ??= []).push(candidate.target)
  // 从 candidate.target 出发能否回到 candidate.source
  const stack = [candidate.target]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === candidate.source) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of adjacency[current] ?? []) stack.push(next)
  }
  return false
}

// ─── 输入解析（basicRunner.ts:15-35 移植 + splitter 端口映射解包）───

export interface ResolvedInput {
  sourceNodeId: string
  sourceHandle: string
  /** 来源节点标题（端口页签展示） */
  sourceTitle: string
  dataType: 'Text' | 'Image'
  /** 解包后的本端口值：普通 Text → 原字符串；splitter 端口映射 → 按 sourceHandle 取段落 */
  value: unknown
}

export function resolveNodeInputs(graph: GraphSnapshot, nodeId: string): Record<string, ResolvedInput> {
  const inputMap: Record<string, ResolvedInput> = {}
  for (const edge of graph.edges) {
    if (edge.target !== nodeId) continue
    const sourceNode = graph.nodes.find((n) => n.id === edge.source)
    const result = sourceNode?.data.result
    if (!sourceNode || !result) continue

    let value: unknown = result.value
    if (
      result.dataType === 'Text' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof edge.sourceHandle === 'string' &&
      edge.sourceHandle in (value as Record<string, unknown>)
    ) {
      value = (value as Record<string, unknown>)[edge.sourceHandle]
    }

    inputMap[edge.targetHandle ?? ''] = {
      sourceNodeId: edge.source,
      sourceHandle: edge.sourceHandle ?? '',
      sourceTitle: sourceNode.data.title,
      dataType: result.dataType,
      value,
    }
  }
  return inputMap
}

/** 缓存键 = type + config + inputs（executor.ts:142-155 移植；inputs 取解包后值） */
export function computeInputHash(node: RFFlowNode, inputs: Record<string, ResolvedInput>): string {
  const serializedInputs: Record<string, unknown> = {}
  for (const [port, input] of Object.entries(inputs)) {
    serializedInputs[port] = { s: input.sourceNodeId, v: input.value }
  }
  const payload = JSON.stringify({
    type: node.type,
    config: node.data.config,
    inputs: serializedInputs,
  })
  let hash = 0
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return String(hash)
}

/** 供面板/摘要读取的节点数据快捷类型 */
export type NodeWithData = RFFlowNode
