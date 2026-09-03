/**
 * DAG 运行器（自旧画布 engine/executor.ts 移植，D4）。
 *
 * 语义对齐 R6：Kahn 拓扑分层、层内并行（allSettled）、失败即停、
 * 结果缓存（hash 未变且 success/cached 跳过重跑）、脏传播由 store 承担、
 * 层边界暂停（pauseAfterRun）、软停止（AbortSignal 透传网络调用）。
 * 差异点（本需求修复项）：网络/上游类错误重试 2 次而本地校验错误不重试；
 * 缓存命中显示「缓存复用」状态；执行前校验一次性标注全部错误节点。
 */
import type { AssetEntry, LogEntry, NodeResult, NodeStatus, RFFlowNode } from '../types'
import type { GraphSnapshot } from './graph'
import { detectCycles, findAncestors, findDescendants, resolveNodeInputs, topologicalSort, computeInputHash } from './graph'
import { getNodeModule, getNodeInputs } from './nodes/registry'
import type { NodeRunResult } from './nodes/types'

const RETRY_COUNT = 2
const RETRY_DELAY_MS = 1000

export interface RunnerCallbacks {
  setNodeStatus(nodeId: string, status: NodeStatus): void
  setNodeResult(nodeId: string, result: NodeResult): void
  clearNodeLogs(nodeId: string): void
  addNodeLog(nodeId: string, level: LogEntry['level'], message: string): void
  addAssets(entries: AssetEntry[]): void
  /** 运行级错误提示（工具栏 toast） */
  notifyError(message: string): void
}

interface LocalValidationError {
  nodeId: string
  message: string
}

/** 执行前本地校验（R6.1）：失败直接终止并标注错误节点，不发起任何网络请求 */
function validateForRun(graph: GraphSnapshot, targetNodeIds?: Set<string>): LocalValidationError[] {
  const errors: LocalValidationError[] = []
  const cycles = detectCycles(graph.nodes, graph.edges)
  if (cycles.length > 0) {
    const names = cycles.map((id) => graph.nodes.find((n) => n.id === id)?.data.title ?? id).join('、')
    return graph.nodes.filter((n) => cycles.includes(n.id)).map((n) => ({
      nodeId: n.id,
      message: `工作流存在循环依赖（${names}），不支持循环。`,
    }))
  }

  for (const node of graph.nodes) {
    if (targetNodeIds && !targetNodeIds.has(node.id)) continue
    const config = node.data.config
    const title = node.data.title
    const connected = new Set(
      graph.edges.filter((e) => e.target === node.id).map((e) => e.targetHandle ?? '')
    )

    // 必填输入端口必须已连接
    for (const port of getNodeInputs(node, graph)) {
      if (port.required && !connected.has(port.id)) {
        errors.push({ nodeId: node.id, message: `节点「${title}」缺少必填输入「${port.name}」。` })
      }
    }

    switch (node.type) {
      case 'text-ai': {
        const taskPrompt = typeof config.taskPrompt === 'string' ? config.taskPrompt : ''
        const detailPrompt = typeof config.detailPrompt === 'string' ? config.detailPrompt : ''
        const hasUpstream = connected.has('text')
        if (!taskPrompt.trim() && !detailPrompt.trim() && !hasUpstream) {
          errors.push({ nodeId: node.id, message: `文字 AI 节点「${title}」缺少有效提示内容或上游输入。` })
        }
        if (typeof config.channelModelId !== 'number' || !config.channelModelId) {
          errors.push({ nodeId: node.id, message: `文字 AI 节点「${title}」未选择模型。` })
        }
        break
      }
      case 'image-ai': {
        if (typeof config.logicalModelId !== 'number' || !config.logicalModelId) {
          errors.push({ nodeId: node.id, message: `图片 AI 节点「${title}」未选择模型。` })
        }
        if (!config.aspectRatio) {
          errors.push({ nodeId: node.id, message: `图片 AI 节点「${title}」未设置宽高比。` })
        }
        if (!config.resolution) {
          errors.push({ nodeId: node.id, message: `图片 AI 节点「${title}」未设置分辨率。` })
        }
        break
      }
      case 'prompt-splitter': {
        if (!config.delimiter) {
          errors.push({ nodeId: node.id, message: `提示词拆分节点「${title}」未设置分隔符。` })
        }
        break
      }
      case 'save': {
        if (connected.size === 0) {
          errors.push({ nodeId: node.id, message: `保存节点「${title}」至少需要连接一个输入。` })
        }
        break
      }
      default:
        break
    }
  }
  return errors
}

export class GraphRunner {
  private getGraph: () => GraphSnapshot
  private callbacks: RunnerCallbacks
  private aborted = false
  private paused = false
  private pausedNodeId: string | null = null
  private onPauseResolve: (() => void) | null = null
  private controller = new AbortController()

  constructor(getGraph: () => GraphSnapshot, callbacks: RunnerCallbacks) {
    this.getGraph = getGraph
    this.callbacks = callbacks
  }

  abort(): void {
    this.aborted = true
    this.controller.abort()
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

  getPausedNodeId(): string | null {
    return this.pausedNodeId
  }

  // ─── 四种运行模式（R6.3）───

  async runAll(): Promise<boolean> {
    const graph = this.getGraph()
    if (!this.preValidate(graph, undefined)) return false
    const levels = topologicalSort(graph.nodes, graph.edges)
    if (levels.length === 0) return true
    return this.executeLevels(levels)
  }

  async runToCurrent(nodeId: string): Promise<boolean> {
    const graph = this.getGraph()
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (!node) return false
    const scope = findAncestors(nodeId, graph.nodes, graph.edges)
    scope.add(nodeId)
    if (!this.preValidate(graph, scope)) return false
    const filteredNodes = graph.nodes.filter((n) => scope.has(n.id))
    const filteredEdges = graph.edges.filter((e) => scope.has(e.source) && scope.has(e.target))
    if (filteredNodes.length === 0) return true
    return this.executeLevels(topologicalSort(filteredNodes, filteredEdges))
  }

  async runFromCurrent(nodeId: string): Promise<boolean> {
    const graph = this.getGraph()
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (!node) return false
    const scope = findDescendants(nodeId, graph.nodes, graph.edges)
    scope.add(nodeId)
    if (!this.preValidate(graph, scope)) return false
    const filteredNodes = graph.nodes.filter((n) => scope.has(n.id))
    const filteredEdges = graph.edges.filter((e) => scope.has(e.source) && scope.has(e.target))
    if (filteredNodes.length === 0) return true
    return this.executeLevels(topologicalSort(filteredNodes, filteredEdges))
  }

  async runSingle(nodeId: string): Promise<boolean> {
    const graph = this.getGraph()
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (!node) return false
    if (!this.preValidate(graph, new Set([nodeId]))) return false
    return this.executeLevels([[nodeId]])
  }

  // ─── 内部 ───

  private preValidate(graph: GraphSnapshot, scope: Set<string> | undefined): boolean {
    const errors = validateForRun(graph, scope)
    if (errors.length === 0) return true
    for (const err of errors) {
      this.callbacks.setNodeStatus(err.nodeId, 'failed')
      this.callbacks.addNodeLog(err.nodeId, 'error', err.message)
    }
    this.callbacks.notifyError(`运行终止：${errors[0].message}${errors.length > 1 ? `（共 ${errors.length} 个问题）` : ''}`)
    return false
  }

  private async executeLevels(levels: string[][]): Promise<boolean> {
    for (const level of levels) {
      if (this.aborted) return false

      const tasks = level.map((nodeId) => this.executeNodeWithRetry(nodeId))
      const results = await Promise.allSettled(tasks)

      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('[rf-canvas] 节点执行异常:', result.reason)
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
    const graph = this.getGraph()
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (!node) return false

    const mod = getNodeModule(node.type ?? '')
    if (!mod) {
      this.callbacks.setNodeStatus(nodeId, 'failed')
      this.callbacks.addNodeLog(nodeId, 'error', `节点「${node.data.title}」尚未实现运行逻辑。`)
      return false
    }

    const inputs = resolveNodeInputs(graph, nodeId)
    const inputHash = computeInputHash(node, inputs)

    // 缓存复用（R6.6）：hash 未变且上次 success/cached；dirty/failed 强制重跑
    if (
      node.data.result?.inputHash &&
      node.data.result.inputHash === inputHash &&
      (node.data.status === 'success' || node.data.status === 'cached')
    ) {
      this.callbacks.setNodeStatus(nodeId, 'cached')
      this.callbacks.addNodeLog(nodeId, 'info', '输入未变化，缓存复用上次结果。')
      return true
    }

    this.callbacks.clearNodeLogs(nodeId)
    this.callbacks.setNodeStatus(nodeId, 'running')

    let lastError = ''
    let lastRetryable = true

    for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
      if (this.aborted) {
        this.callbacks.setNodeStatus(nodeId, 'idle')
        this.callbacks.addNodeLog(nodeId, 'warn', '运行已停止。')
        return false
      }

      if (attempt > 0) {
        this.callbacks.addNodeLog(nodeId, 'warn', `重试第 ${attempt} 次...`)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        if (this.aborted) {
          this.callbacks.setNodeStatus(nodeId, 'idle')
          this.callbacks.addNodeLog(nodeId, 'warn', '运行已停止。')
          return false
        }
      }

      const startedAt = Date.now()
      let result: NodeRunResult
      try {
        result = await mod.run({
          graph,
          node,
          inputs,
          signal: this.controller.signal,
          addLog: (level, message) => this.callbacks.addNodeLog(nodeId, level, message),
          addAssets: (entries) => this.callbacks.addAssets(entries),
        })
      } catch (err) {
        result = {
          success: false,
          message: err instanceof Error ? err.message : '节点执行异常',
        }
      }
      const durationMs = Date.now() - startedAt

      if (result.success) {
        const finalResult: NodeResult = { ...result.result, inputHash }
        this.callbacks.setNodeResult(nodeId, finalResult)
        this.callbacks.addNodeLog(nodeId, 'info', `执行完成，耗时 ${(durationMs / 1000).toFixed(1)}s。`)
        for (const log of result.logs ?? []) {
          this.callbacks.addNodeLog(nodeId, log.level, log.message)
        }

        if (this.shouldPause(node)) {
          this.paused = true
          this.pausedNodeId = nodeId
          this.callbacks.setNodeStatus(nodeId, 'paused')
          this.callbacks.addNodeLog(nodeId, 'info', '节点已暂停，等待确认。')
        }
        return true
      }

      lastError = result.message
      lastRetryable = result.retryable !== false
      for (const log of result.logs ?? []) {
        this.callbacks.addNodeLog(nodeId, log.level, log.message)
      }
      this.callbacks.addNodeLog(nodeId, 'error', `执行失败: ${result.message}`)

      if (this.aborted || !lastRetryable) break
    }

    if (this.aborted) {
      this.callbacks.setNodeStatus(nodeId, 'idle')
      this.callbacks.addNodeLog(nodeId, 'warn', '运行已停止。')
      return false
    }

    this.callbacks.setNodeStatus(nodeId, 'failed')
    this.callbacks.addNodeLog(
      nodeId,
      'error',
      lastRetryable
        ? `节点执行失败（已重试 ${RETRY_COUNT} 次）: ${lastError}`
        : `节点执行失败: ${lastError}`
    )
    return false
  }

  private shouldPause(node: RFFlowNode): boolean {
    if (node.type === 'text-ai' || node.type === 'prompt-splitter') {
      return node.data.config.pauseAfterRun === true
    }
    return false
  }
}
