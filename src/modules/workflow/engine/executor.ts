import type {
  NodePort,
  NodeResult,
  NodeStatus,
  WorkflowEdge,
  WorkflowModel,
  WorkflowNode,
} from '@/modules/workflow/types/workflow'
import { runBasicNode, resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { detectCycles } from '@/modules/workflow/engine/validator'

const RETRY_COUNT = 2
const RETRY_DELAY_MS = 1000

export interface RunnerCallbacks {
  setNodeStatus(nodeId: string, status: NodeStatus): void
  setNodeResult(nodeId: string, result: NodeResult): void
  setNodeOutputs(nodeId: string, outputs: NodePort[]): void
  clearNodeLogs(nodeId: string): void
  addNodeLog(
    nodeId: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    detail?: { request?: unknown; response?: unknown }
  ): void
}

// ========== Graph Algorithms ==========

export const topologicalSort = (nodes: WorkflowNode[], edges: WorkflowEdge[]): string[][] => {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const inDegree: Record<string, number> = {}
  const adjacency: Record<string, string[]> = {}

  for (const id of nodeIds) {
    inDegree[id] = 0
    adjacency[id] = []
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue
    adjacency[edge.sourceNodeId].push(edge.targetNodeId)
    inDegree[edge.targetNodeId]++
  }

  const levels: string[][] = []
  let currentLevel: string[] = []

  for (const id of nodeIds) {
    if (inDegree[id] === 0) currentLevel.push(id)
  }

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

export const findAncestors = (
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Set<string> => {
  const reverseAdj: Record<string, string[]> = {}
  for (const node of nodes) {
    reverseAdj[node.id] = []
  }
  for (const edge of edges) {
    if (reverseAdj[edge.targetNodeId]) {
      reverseAdj[edge.targetNodeId].push(edge.sourceNodeId)
    }
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

export const findDescendants = (
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Set<string> => {
  const adjacency: Record<string, string[]> = {}
  for (const node of nodes) {
    adjacency[node.id] = []
  }
  for (const edge of edges) {
    if (adjacency[edge.sourceNodeId]) {
      adjacency[edge.sourceNodeId].push(edge.targetNodeId)
    }
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

// Compute a simple input hash for cache comparison
export const computeInputHash = (node: WorkflowNode, inputs: Record<string, unknown>): string => {
  const payload = JSON.stringify({
    type: node.type,
    config: node.config,
    inputs,
  })
  let hash = 0
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return String(hash)
}

const saveCacheResultToAssets = (node: WorkflowNode, workflow: WorkflowModel): void => {
  if (node.type !== 'image-ai') return

  const result = node.result
  if (!result || result.dataType !== 'Image') return

  const value = result.value as Record<string, unknown> | undefined
  if (!value?.image || typeof value.image !== 'object') return

  const image = value.image as Record<string, unknown>
  const previewUrl = typeof image.previewUrl === 'string' ? image.previewUrl : ''

  // Skip if already saved or no URL to save
  if (value.__assetSaved || !previewUrl) return

  ;(window as any).electronAPI?.canvasAssets
    .add({
      fileName: typeof image.fileName === 'string' ? image.fileName : 'image.png',
      sourceUrl: previewUrl,
      nodeId: node.id,
      nodeTitle: node.title,
      workflowId: workflow.id,
    })
    .catch(() => {
      /* non-critical */
    })

  value.__assetSaved = true
}

// ========== DAG Runner ==========

export class WorkflowRunner {
  private getWorkflow: () => WorkflowModel
  private callbacks: RunnerCallbacks
  private aborted = false
  private paused = false
  private pausedNodeId: string | null = null
  private onPauseResolve: (() => void) | null = null

  constructor(getWorkflow: () => WorkflowModel, callbacks: RunnerCallbacks) {
    this.getWorkflow = getWorkflow
    this.callbacks = callbacks
  }

  abort(): void {
    this.aborted = true
    if (this.onPauseResolve) {
      this.onPauseResolve()
      this.onPauseResolve = null
    }
  }

  confirmPausedNode(): void {
    const nodeId = this.pausedNodeId
    this.paused = false
    this.pausedNodeId = null
    if (nodeId) {
      this.callbacks.setNodeStatus(nodeId, 'success')
      this.callbacks.addNodeLog(nodeId, 'info', '用户确认继续。')
    }
    if (this.onPauseResolve) {
      this.onPauseResolve()
      this.onPauseResolve = null
    }
  }

  isRunning(): boolean {
    return !this.aborted
  }

  getPausedNodeId(): string | null {
    return this.pausedNodeId
  }

  async runAll(): Promise<boolean> {
    const workflow = this.getWorkflow()

    const cycles = detectCycles(workflow.nodes, workflow.edges)
    if (cycles.length > 0) {
      const names = cycles
        .map((id) => workflow.nodes.find((n) => n.id === id)?.title ?? id)
        .join('、')
      this.callbacks.addNodeLog('', 'error', `运行失败：工作流存在循环依赖，涉及节点：${names}。`)
      return false
    }

    const levels = topologicalSort(workflow.nodes, workflow.edges)
    if (levels.length === 0) return true

    return this.executeLevels(levels)
  }

  async runToCurrent(nodeId: string): Promise<boolean> {
    const workflow = this.getWorkflow()
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node) return false

    const cycles = detectCycles(workflow.nodes, workflow.edges)
    if (cycles.length > 0) {
      const names = cycles
        .map((id) => workflow.nodes.find((n) => n.id === id)?.title ?? id)
        .join('、')
      this.callbacks.addNodeLog(
        nodeId,
        'error',
        `运行失败：工作流存在循环依赖，涉及节点：${names}。`
      )
      return false
    }

    const ancestors = findAncestors(nodeId, workflow.nodes, workflow.edges)
    ancestors.add(nodeId)

    const filteredNodes = workflow.nodes.filter((n) => ancestors.has(n.id))
    const filteredEdges = workflow.edges.filter(
      (e) => ancestors.has(e.sourceNodeId) && ancestors.has(e.targetNodeId)
    )

    if (filteredNodes.length === 0) return true

    const levels = topologicalSort(filteredNodes, filteredEdges)
    return this.executeLevels(levels)
  }

  async runFromCurrent(nodeId: string): Promise<boolean> {
    const workflow = this.getWorkflow()
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node) return false

    const cycles = detectCycles(workflow.nodes, workflow.edges)
    if (cycles.length > 0) {
      const names = cycles
        .map((id) => workflow.nodes.find((n) => n.id === id)?.title ?? id)
        .join('、')
      this.callbacks.addNodeLog(
        nodeId,
        'error',
        `运行失败：工作流存在循环依赖，涉及节点：${names}。`
      )
      return false
    }

    const descendants = findDescendants(nodeId, workflow.nodes, workflow.edges)
    descendants.add(nodeId)

    const filteredNodes = workflow.nodes.filter((n) => descendants.has(n.id))
    const filteredEdges = workflow.edges.filter(
      (e) => descendants.has(e.sourceNodeId) && descendants.has(e.targetNodeId)
    )

    if (filteredNodes.length === 0) return true

    const levels = topologicalSort(filteredNodes, filteredEdges)
    return this.executeLevels(levels)
  }

  private async executeLevels(levels: string[][]): Promise<boolean> {
    for (const level of levels) {
      if (this.aborted) return false

      const tasks = level.map((nodeId) => this.executeNodeWithRetry(nodeId))
      const results = await Promise.allSettled(tasks)

      for (const result of results) {
        if (result.status === 'rejected') {
          return false
        }
        if (result.status === 'fulfilled' && !result.value) {
          return false
        }
      }

      if (this.paused) {
        await new Promise<void>((resolve) => {
          this.onPauseResolve = resolve
        })
        if (this.aborted) return false
      }
    }

    return true
  }

  private async executeNodeWithRetry(nodeId: string): Promise<boolean> {
    const workflow = this.getWorkflow()
    const node = workflow.nodes.find((n) => n.id === nodeId)
    if (!node) return false

    if (node.disabled || node.status === 'affected') return true

    // Cache check
    const inputs = resolveNodeInputs(workflow, nodeId)
    const inputHash = computeInputHash(node, inputs)
    if (
      node.result?.inputHash &&
      node.result.inputHash === inputHash &&
      node.status === 'success'
    ) {
      this.callbacks.addNodeLog(nodeId, 'info', '输入未变化，复用缓存结果。')
      saveCacheResultToAssets(node, workflow)
      return true
    }

    // Validate required inputs
    for (const input of node.inputs) {
      if (input.required && !inputs[input.id]) {
        this.callbacks.setNodeStatus(nodeId, 'failed')
        this.callbacks.addNodeLog(nodeId, 'error', `缺少必填输入「${input.name}」。`)
        return false
      }
    }

    // Clear prior logs before re-running
    this.callbacks.clearNodeLogs(nodeId)

    let lastError = ''

    for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
      if (this.aborted) return false

      if (attempt > 0) {
        this.callbacks.addNodeLog(nodeId, 'warn', `重试第 ${attempt} 次...`)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        if (this.aborted) return false
      }

      this.callbacks.setNodeStatus(nodeId, 'running')

      const startedAt = Date.now()
      const result = await runBasicNode(workflow, node)
      const durationMs = Date.now() - startedAt

      if (result.success) {
        if (result.outputs) {
          this.callbacks.setNodeOutputs(nodeId, result.outputs)
        }

        result.result.inputHash = inputHash
        this.callbacks.setNodeResult(nodeId, result.result)

        this.callbacks.addNodeLog(
          nodeId,
          'info',
          `执行完成，耗时 ${(durationMs / 1000).toFixed(1)}s。`
        )
        for (const log of result.logs ?? []) {
          this.callbacks.addNodeLog(nodeId, log.level, log.message, {
            request: (log as Record<string, unknown>).request,
            response: (log as Record<string, unknown>).response,
          })
        }

        if (this.shouldPause(node)) {
          this.paused = true
          this.pausedNodeId = nodeId
          this.callbacks.setNodeStatus(nodeId, 'paused')
          this.callbacks.addNodeLog(nodeId, 'info', '节点已暂停，等待确认。')
          return true
        }

        return true
      }

      lastError = result.message
      for (const log of result.logs ?? []) {
        this.callbacks.addNodeLog(nodeId, log.level, log.message, {
          request: log.request,
          response: log.response,
        })
      }
      this.callbacks.addNodeLog(nodeId, 'error', `执行失败: ${result.message}`)
    }

    this.callbacks.setNodeStatus(nodeId, 'failed')
    this.callbacks.addNodeLog(
      nodeId,
      'error',
      `节点执行失败（已重试 ${RETRY_COUNT} 次）: ${lastError}`
    )
    return false
  }

  private shouldPause(node: WorkflowNode): boolean {
    if (node.type === 'text-ai' || node.type === 'prompt-splitter') {
      return !!(node.config as Record<string, unknown>).pauseAfterRun
    }
    return false
  }
}
