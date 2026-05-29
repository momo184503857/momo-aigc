import { defineStore } from 'pinia'
import type { Edge, Node } from '@vue-flow/core'
import type {
  ImageAiNodeConfig,
  LocalImageAsset,
  NodeLog,
  NodePort,
  NodeResult,
  NodeStatus,
  NodeType,
  PromptSplitterNodeConfig,
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData,
  WorkflowEdge,
  WorkflowModel,
  WorkflowNode,
  WorkflowPosition,
} from '@/modules/workflow/types/workflow'
import { runBasicNode } from '@/modules/workflow/engine/basicRunner'
import { getNodeDefinition } from '@/modules/workflow/nodes/nodeRegistry'
import { canAddEdge } from '@/modules/workflow/engine/validator'
import { WorkflowRunner, findDescendants } from '@/modules/workflow/engine/executor'
import type { RunnerCallbacks } from '@/modules/workflow/engine/executor'
import { canvasApi } from '@/services/canvasApi'
import { useUiFeedback } from '@/composables/useUiFeedback'

type CanvasNode = Node<WorkflowCanvasNodeData>
type CanvasEdge = Edge<WorkflowCanvasEdgeData>

const createId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const deepClone = <T>(obj: T): T => {
  try {
    return structuredClone(obj)
  } catch {
    return JSON.parse(JSON.stringify(obj))
  }
}

const cloneConfig = (config: Record<string, unknown>): Record<string, unknown> => deepClone(config)

const nextNodeSuffix = (nodes: WorkflowNode[]): number => {
  let max = 0
  for (const node of nodes) {
    const match = node.title.match(/\s(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return max + 1
}

const buildImageAiInputs = (imageCount: number): NodePort[] => {
  const inputs: NodePort[] = [
    { id: 'prompt', name: 'Prompt', dataType: 'Text', direction: 'input', required: true },
  ]
  for (let i = 1; i <= imageCount; i++) {
    inputs.push({ id: `image_${i}`, name: `图${i}`, dataType: 'Image', direction: 'input' })
  }
  return inputs
}

const buildNode = (
  type: NodeType,
  position: WorkflowPosition,
  existingNodes: WorkflowNode[]
): WorkflowNode => {
  const definition = getNodeDefinition(type)
  const suffix = nextNodeSuffix(existingNodes)
  const config = cloneConfig(definition.defaultConfig)

  let inputs: NodePort[]
  if (type === 'image-ai') {
    const imageCount =
      typeof config.imageCount === 'number' && config.imageCount >= 1 && config.imageCount <= 9
        ? config.imageCount
        : 3
    inputs = buildImageAiInputs(imageCount)
  } else {
    inputs = definition.inputs.map((port) => ({ ...port }))
  }

  return {
    id: createId('node'),
    type,
    title: `${definition.title} ${suffix}`,
    position,
    inputs,
    outputs: definition.outputs.map((port) => ({ ...port })),
    config,
    status: 'idle',
    disabled: false,
    logs: [],
    width: 240,
  }
}

const buildEdgeId = (edge: Omit<WorkflowEdge, 'id'>): string =>
  `edge_${edge.sourceNodeId}_${edge.sourcePortId}_${edge.targetNodeId}_${edge.targetPortId}`

let activeRunner: WorkflowRunner | null = null

let _canvasNodesCache: CanvasNode[] = []
let _canvasEdgesCache: CanvasEdge[] = []

interface HistorySnapshot {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

const MAX_HISTORY = 50

const statusColorMap: Record<NodeStatus, string> = {
  idle: 'var(--el-text-color-secondary)',
  waiting: 'var(--el-color-info)',
  running: 'var(--el-color-primary)',
  success: 'var(--el-color-success)',
  failed: 'var(--el-color-danger)',
  disabled: 'var(--el-text-color-placeholder)',
  affected: 'var(--el-color-info)',
  dirty: 'var(--el-color-warning)',
  paused: 'var(--el-color-warning)',
}

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    workflow: {
      id: createId('workflow'),
      name: '未命名 AI 画布',
      nodes: [] as WorkflowNode[],
      edges: [] as WorkflowEdge[],
      updatedAt: new Date().toISOString(),
    } satisfies WorkflowModel,
    selectedNodeId: '' as string,
    selectedEdgeId: '' as string,
    copiedNode: null as WorkflowNode | null,
    isRunning: false as boolean,
    executionMode: '' as string,
    pausedNodeId: '' as string,
    history: [] as HistorySnapshot[],
    historyIndex: -1 as number,
    _currentProjectId: '' as string,
  }),

  getters: {
    selectedNode(state): WorkflowNode | undefined {
      return state.workflow.nodes.find((node) => node.id === state.selectedNodeId)
    },

    canvasNodes(state): CanvasNode[] {
      const prevById = new Map(_canvasNodesCache.map((cn) => [cn.id, cn]))
      const workflowNodes = state.workflow.nodes

      let structureChanged = _canvasNodesCache.length !== workflowNodes.length
      if (!structureChanged) {
        for (const wNode of workflowNodes) {
          const prev = prevById.get(wNode.id)
          if (
            !prev ||
            prev.position.x !== wNode.position.x ||
            prev.position.y !== wNode.position.y
          ) {
            structureChanged = true
            break
          }
        }
      }

      if (!structureChanged) {
        for (const wNode of workflowNodes) {
          const cached = prevById.get(wNode.id)
          if (cached) {
            cached.data = { workflowNode: wNode }
          }
        }
        return [..._canvasNodesCache]
      }

      const result: CanvasNode[] = []
      for (const workflowNode of workflowNodes) {
        const prev = prevById.get(workflowNode.id)
        if (
          prev &&
          prev.position.x === workflowNode.position.x &&
          prev.position.y === workflowNode.position.y
        ) {
          prev.data = { workflowNode }
          result.push(prev)
        } else {
          result.push({
            id: workflowNode.id,
            type: 'workflow',
            position: workflowNode.position,
            data: { workflowNode },
          })
        }
      }

      _canvasNodesCache = result
      return result
    },

    canvasEdges(state): CanvasEdge[] {
      const prevById = new Map(_canvasEdgesCache.map((ce) => [ce.id, ce]))
      const workflowEdges = state.workflow.edges

      let structureChanged = _canvasEdgesCache.length !== workflowEdges.length
      if (!structureChanged) {
        for (const wEdge of workflowEdges) {
          const prev = prevById.get(wEdge.id)
          if (
            !prev ||
            prev.source !== wEdge.sourceNodeId ||
            prev.target !== wEdge.targetNodeId ||
            prev.sourceHandle !== wEdge.sourcePortId ||
            prev.targetHandle !== wEdge.targetPortId
          ) {
            structureChanged = true
            break
          }
        }
      }

      if (!structureChanged) {
        for (const wEdge of workflowEdges) {
          const cached = prevById.get(wEdge.id)
          if (cached) {
            cached.data = { workflowEdge: wEdge }
          }
        }
        return [..._canvasEdgesCache]
      }

      const result: CanvasEdge[] = []
      for (const workflowEdge of workflowEdges) {
        const prev = prevById.get(workflowEdge.id)
        if (prev) {
          prev.data = { workflowEdge }
          result.push(prev)
        } else {
          result.push({
            id: workflowEdge.id,
            source: workflowEdge.sourceNodeId,
            sourceHandle: workflowEdge.sourcePortId,
            target: workflowEdge.targetNodeId,
            targetHandle: workflowEdge.targetPortId,
            type: 'default',
            animated: false,
            data: { workflowEdge },
            style: {
              stroke: statusColorMap.idle,
            },
          })
        }
      }

      _canvasEdgesCache = result
      return result
    },
  },

  actions: {
    touch() {
      this.workflow.updatedAt = new Date().toISOString()
    },

    pushHistory() {
      this.history = this.history.slice(0, this.historyIndex + 1)
      this.history.push({
        nodes: deepClone(this.workflow.nodes),
        edges: deepClone(this.workflow.edges),
      })
      if (this.history.length > MAX_HISTORY) {
        this.history.shift()
      }
      this.historyIndex = this.history.length - 1
    },

    undo() {
      if (this.historyIndex < 0 || this.isRunning) return
      if (this.historyIndex === this.history.length - 1) {
        this.history.push({
          nodes: deepClone(this.workflow.nodes),
          edges: deepClone(this.workflow.edges),
        })
        if (this.history.length > MAX_HISTORY) {
          this.history.shift()
        } else {
          this.historyIndex++
        }
      }
      this.historyIndex--
      const snapshot = this.history[this.historyIndex]
      if (snapshot) {
        this.workflow.nodes = snapshot.nodes
        this.workflow.edges = snapshot.edges
        this.touch()
      }
    },

    redo() {
      if (this.historyIndex >= this.history.length - 1 || this.isRunning) return
      this.historyIndex++
      const snapshot = this.history[this.historyIndex]
      if (snapshot) {
        this.workflow.nodes = snapshot.nodes
        this.workflow.edges = snapshot.edges
        this.touch()
      }
    },

    addNode(type: NodeType, position: WorkflowPosition) {
      this.pushHistory()
      const node = buildNode(type, position, this.workflow.nodes)
      this.workflow.nodes.push(node)
      this.selectedNodeId = node.id
      this.selectedEdgeId = ''
      this.touch()
    },

    copyNode(nodeId: string) {
      const node = this.workflow.nodes.find((n) => n.id === nodeId)
      if (!node) return
      try {
        this.copiedNode = deepClone(node)
      } catch (err) {
        console.error('Copy node error:', err)
      }
    },

    pasteNode(position: WorkflowPosition) {
      if (!this.copiedNode) return
      this.pushHistory()
      const baseTitle = this.copiedNode.title.replace(/\s\d+$/, '')
      const suffix = nextNodeSuffix(this.workflow.nodes)
      const node = {
        ...deepClone(this.copiedNode),
        id: createId('node'),
        title: `${baseTitle} ${suffix}`,
        position,
        status: 'idle' as NodeStatus,
        result: undefined,
        logs: [],
      }
      this.workflow.nodes.push(node)
      this.selectedNodeId = node.id
      this.selectedEdgeId = ''
      this.touch()
    },

    selectNode(nodeId: string) {
      this.selectedNodeId = nodeId
      this.selectedEdgeId = ''
    },

    selectEdge(edgeId: string) {
      this.selectedEdgeId = edgeId
      this.selectedNodeId = ''
    },

    clearSelection() {
      this.selectedNodeId = ''
      this.selectedEdgeId = ''
    },

    updateSingleNodePosition(nodeId: string, position: { x: number; y: number }) {
      const node = this.workflow.nodes.find((n) => n.id === nodeId)
      if (!node || (node.position.x === position.x && node.position.y === position.y)) return

      this.pushHistory()
      this.workflow.nodes = this.workflow.nodes.map((n) =>
        n.id === nodeId ? { ...n, position } : n
      )
      this.touch()
    },

    addEdge(edge: Omit<WorkflowEdge, 'id'>) {
      this.pushHistory()
      const workflowEdge: WorkflowEdge = {
        ...edge,
        id: buildEdgeId(edge),
      }
      const result = canAddEdge(workflowEdge, this.workflow.nodes, this.workflow.edges)

      if (!result.valid) {
        const { warning } = useUiFeedback()
        warning(result.message || '连接失败。')
        return false
      }

      this.workflow.edges.push(workflowEdge)
      this.touch()
      return true
    },

    deleteSelected(nodeIds?: string[]) {
      this.pushHistory()

      if (nodeIds && nodeIds.length > 0) {
        const idSet = new Set(nodeIds)
        this.workflow.nodes = this.workflow.nodes.filter((node) => !idSet.has(node.id))
        this.workflow.edges = this.workflow.edges.filter(
          (edge) => !idSet.has(edge.sourceNodeId) && !idSet.has(edge.targetNodeId)
        )
        this.clearSelection()
        this.touch()
        return
      }

      if (this.selectedNodeId) {
        const nodeId = this.selectedNodeId
        this.workflow.nodes = this.workflow.nodes.filter((node) => node.id !== nodeId)
        this.workflow.edges = this.workflow.edges.filter(
          (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
        )
        this.clearSelection()
        this.touch()
        return
      }

      if (this.selectedEdgeId) {
        this.workflow.edges = this.workflow.edges.filter((edge) => edge.id !== this.selectedEdgeId)
        this.clearSelection()
        this.touch()
      }
    },

    setNodeDisabled(nodeId: string, disabled: boolean) {
      this.pushHistory()
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, disabled, status: disabled ? 'disabled' : 'idle' }
          : node
      )
      this.touch()
    },

    updateNodeTitle(nodeId: string, title: string) {
      this.pushHistory()
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        node.id === nodeId ? { ...node, title } : node
      )
      this.touch()
    },

    resizeNode(nodeId: string, width: number, height?: number) {
      const node = this.workflow.nodes.find((n) => n.id === nodeId)
      if (!node || (node.width === width && node.height === height)) return
      this.pushHistory()
      this.workflow.nodes = this.workflow.nodes.map((n) =>
        n.id === nodeId ? { ...n, width, height } : n
      )
      this.touch()
    },

    updateNodeConfig(nodeId: string, patch: Record<string, unknown>) {
      const node = this.workflow.nodes.find((n) => n.id === nodeId)
      const wasSuccess = node?.status === 'success'
      const isImageAi = node?.type === 'image-ai'
      const imageCountPatch =
        isImageAi && typeof patch.imageCount === 'number' ? patch.imageCount : undefined
      const validImageCount =
        imageCountPatch !== undefined && imageCountPatch >= 1 && imageCountPatch <= 9
          ? imageCountPatch
          : undefined

      this.workflow.nodes = this.workflow.nodes.map((n) => {
        if (n.id !== nodeId) return n

        const updated = {
          ...n,
          config: { ...n.config, ...patch },
          status: wasSuccess ? ('dirty' as NodeStatus) : n.status,
        }

        if (validImageCount !== undefined) {
          updated.inputs = buildImageAiInputs(validImageCount)
        }

        return updated
      })

      if (validImageCount !== undefined && node) {
        const newPortIds = new Set(buildImageAiInputs(validImageCount).map((p) => p.id))
        this.workflow.edges = this.workflow.edges.filter((edge) => {
          if (edge.targetNodeId !== nodeId) return true
          return newPortIds.has(edge.targetPortId)
        })
      }

      this.touch()

      if (wasSuccess) {
        this.markDownstreamDirty(nodeId)
      }
    },

    setNodeResult(nodeId: string, result: NodeResult) {
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        node.id === nodeId ? { ...node, result, status: 'success' } : node
      )
      this.touch()
    },

    setNodeOutputs(nodeId: string, outputs: NodePort[]) {
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        node.id === nodeId ? { ...node, outputs } : node
      )
      this.workflow.edges = this.workflow.edges.filter((edge) =>
        this.workflow.nodes.some(
          (node) =>
            node.id === edge.sourceNodeId &&
            node.outputs.some((port) => port.id === edge.sourcePortId)
        )
      )
      this.touch()
    },

    setNodeStatus(nodeId: string, status: NodeStatus) {
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        node.id === nodeId ? { ...node, status } : node
      )
      this.touch()
    },

    addNodeLog(
      nodeId: string,
      level: NodeLog['level'],
      message: string,
      detail?: { request?: unknown; response?: unknown }
    ) {
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              logs: [
                ...node.logs,
                {
                  id: createId('log'),
                  nodeId,
                  level,
                  message,
                  startedAt: new Date().toISOString(),
                  ...(detail?.request !== undefined ? { request: detail.request } : {}),
                  ...(detail?.response !== undefined ? { response: detail.response } : {}),
                },
              ],
            }
          : node
      )
      this.touch()
    },

    clearNodeLogs(nodeId: string) {
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        node.id === nodeId ? { ...node, logs: [] } : node
      )
      this.touch()
    },

    async runNode(nodeId: string) {
      const node = this.workflow.nodes.find((item) => item.id === nodeId)
      if (!node) return false

      const { success: showSuccess, error: showError } = useUiFeedback()

      this.clearNodeLogs(nodeId)
      this.setNodeStatus(nodeId, 'running')
      const result = await runBasicNode(this.workflow, node)

      if (!result.success) {
        this.setNodeStatus(nodeId, 'failed')
        this.addNodeLog(nodeId, 'error', result.message)
        showError(result.message)
        return false
      }

      if (result.outputs) {
        this.setNodeOutputs(nodeId, result.outputs)
      }
      this.setNodeResult(nodeId, result.result)
      for (const log of result.logs ?? []) {
        this.addNodeLog(nodeId, log.level, log.message, {
          request: (log as Record<string, unknown>).request,
          response: (log as Record<string, unknown>).response,
        })
      }
      this.addNodeLog(nodeId, 'info', '节点运行完成。')
      showSuccess('节点运行完成')
      return true
    },

    setTextInput(nodeId: string, text: string) {
      this.updateNodeConfig(nodeId, { text })
    },

    setImageInput(nodeId: string, images: LocalImageAsset[]) {
      this.updateNodeConfig(nodeId, { images })
    },

    setTextAiConfig(
      nodeId: string,
      patch: {
        modelName?: string
        taskPrompt?: string
        detailPrompt?: string
        pauseAfterRun?: boolean
        temperature?: number
        maxTokens?: number
      }
    ) {
      this.updateNodeConfig(nodeId, patch)
    },

    setPromptSplitterConfig(nodeId: string, patch: Partial<PromptSplitterNodeConfig>) {
      this.updateNodeConfig(nodeId, patch)
    },

    markDownstreamDirty(nodeId: string) {
      const descendants = findDescendants(nodeId, this.workflow.nodes, this.workflow.edges)
      this.workflow.nodes = this.workflow.nodes.map((node) =>
        descendants.has(node.id) && node.status !== 'disabled' && node.status !== 'affected'
          ? { ...node, status: 'dirty' as NodeStatus }
          : node
      )
      this.touch()
    },

    editNodeOutput(nodeId: string, outputKey: string | undefined, newValue: string) {
      const node = this.workflow.nodes.find((n) => n.id === nodeId)
      if (!node?.result) return

      if (node.result.dataType === 'Text') {
        if (
          outputKey &&
          typeof node.result.value === 'object' &&
          !Array.isArray(node.result.value)
        ) {
          const valueMap = node.result.value as Record<string, unknown>
          valueMap[outputKey] = newValue
        } else {
          node.result.value = newValue
        }
        node.result.updatedAt = new Date().toISOString()
        delete node.result.inputHash
        this.markDownstreamDirty(nodeId)
        this.touch()
      }
    },

    setImageAiConfig(nodeId: string, patch: Partial<ImageAiNodeConfig>) {
      this.updateNodeConfig(nodeId, patch)
    },

    // ========== Workflow Execution ==========

    makeRunnerCallbacks(): RunnerCallbacks {
      return {
        setNodeStatus: (nodeId, status) => this.setNodeStatus(nodeId, status),
        setNodeResult: (nodeId, result) => this.setNodeResult(nodeId, result),
        setNodeOutputs: (nodeId, outputs) => this.setNodeOutputs(nodeId, outputs),
        clearNodeLogs: (nodeId) => this.clearNodeLogs(nodeId),
        addNodeLog: (nodeId, level, message, detail) =>
          this.addNodeLog(nodeId, level, message, detail),
      }
    },

    async runAllWorkflow() {
      if (this.isRunning) return
      this.isRunning = true
      this.executionMode = 'all'

      activeRunner = new WorkflowRunner(() => this.workflow, this.makeRunnerCallbacks())

      try {
        await activeRunner.runAll()
      } finally {
        this.finishExecution()
      }
    },

    async runToCurrent(nodeId: string) {
      if (this.isRunning) return
      this.isRunning = true
      this.executionMode = 'to'

      activeRunner = new WorkflowRunner(() => this.workflow, this.makeRunnerCallbacks())

      try {
        await activeRunner.runToCurrent(nodeId)
      } finally {
        this.finishExecution()
      }
    },

    async runFromCurrent(nodeId: string) {
      if (this.isRunning) return
      this.isRunning = true
      this.executionMode = 'from'

      activeRunner = new WorkflowRunner(() => this.workflow, this.makeRunnerCallbacks())

      try {
        await activeRunner.runFromCurrent(nodeId)
      } finally {
        this.finishExecution()
      }
    },

    confirmPausedNode() {
      if (activeRunner && this.pausedNodeId) {
        activeRunner.confirmPausedNode()
        this.pausedNodeId = ''
      }
    },

    cancelExecution() {
      if (activeRunner) {
        activeRunner.abort()
      }
      this.finishExecution()
    },

    finishExecution() {
      this.isRunning = false
      this.executionMode = ''
      this.pausedNodeId = activeRunner?.getPausedNodeId() ?? ''
      activeRunner = null
    },

    // ========== Project persistence (HTTP API) ==========

    async loadFromDb(projectId: string) {
      if (this.isRunning) return
      try {
        const project = await canvasApi.getProject(projectId)
        if (!project || !project.workflow_data) {
          this.workflow = {
            id: projectId,
            name: project?.name || '未命名 AI 画布',
            nodes: [],
            edges: [],
            updatedAt: new Date().toISOString(),
          }
          this.clearSelection()
          this.pausedNodeId = ''
          this.isRunning = false
          this._currentProjectId = projectId
          return
        }

        const data = JSON.parse(project.workflow_data) as WorkflowModel
        this.workflow = { ...data, id: projectId, name: project.name || data.name }
        this.clearSelection()
        this.pausedNodeId = ''
        this.isRunning = false
      } catch {
        this.workflow = {
          id: projectId,
          name: '未命名 AI 画布',
          nodes: [],
          edges: [],
          updatedAt: new Date().toISOString(),
        }
        this.clearSelection()
        this.pausedNodeId = ''
        this.isRunning = false
      }
      this._currentProjectId = projectId
    },

    async saveToDb(projectId: string) {
      const json = JSON.stringify(this.workflow)
      const nodeCount = this.workflow.nodes.length
      await canvasApi.updateProject(projectId, {
        workflowData: json,
        nodeCount,
      })
    },

    async saveCurrentProject() {
      if (!this._currentProjectId) return
      await this.saveToDb(this._currentProjectId)
      const { success: showSuccess } = useUiFeedback()
      showSuccess('项目已保存')
    },

    async exportTemplate() {
      const template = {
        ...this.workflow,
        nodes: this.workflow.nodes.map((node) => {
          const cleanNode: WorkflowNode = {
            ...node,
            result: undefined,
            logs: [],
            status: 'idle' as const,
          }
          if (node.type === 'image-input' && node.config.images) {
            cleanNode.config = { ...node.config, images: [] }
          }
          return cleanNode
        }),
      }
      const json = JSON.stringify(template, null, 2)
      // Trigger download via browser
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${this.workflow.name || 'workflow'}.json`
      a.click()
      URL.revokeObjectURL(url)
      const { success: showSuccess } = useUiFeedback()
      showSuccess('模板已导出')
    },

    resetWorkflowState() {
      this.workflow.nodes = this.workflow.nodes.map((node) => ({
        ...node,
        status: 'idle' as NodeStatus,
        result: undefined,
        logs: [],
      }))
      this.pausedNodeId = ''
      this.touch()
    },
  },
})
