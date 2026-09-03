/**
 * AI画布 Pro+ 单 store（D3）：节点/连线/视口、撤销栈（D10 快照剥离运行态）、
 * dirty + 2s 防抖自动保存（D9）、运行态（runner 回写 status/result/logs）、成果面板。
 */
import { create } from 'zustand'
import { applyNodeChanges, type NodeChange } from '@xyflow/react'
import type {
  AssetEntry,
  GraphJSON,
  LogEntry,
  NodeResult,
  NodeStatus,
  NodeType,
  RFFlowEdge,
  RFFlowNode,
  Viewport,
} from './types'
import type { GraphSnapshot } from './engine/graph'
import { findDescendants } from './engine/graph'
import { getNodeModule } from './engine/nodes/registry'
import { GraphRunner, type RunnerCallbacks } from './engine/runner'
import { projectApi } from './api'
import { scheduleSave, flushSave, type SaveState } from './autosave'

const MAX_HISTORY = 50

/** 历史快照：结构 + 配置，剥离运行态（D10/R3.7） */
interface HistorySnapshot {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; title: string; config: Record<string, unknown> }>
  edges: Array<{ id: string; source: string; sourceHandle: string | null; target: string; targetHandle: string | null }>
}

interface Clipboard {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; title: string; config: Record<string, unknown> }>
  edges: Array<{ source: string; sourceHandle: string | null; target: string; targetHandle: string | null }>
}

interface Toast {
  id: number
  kind: 'info' | 'error'
  message: string
}

interface RfStore {
  projectId: number
  projectName: string
  loaded: boolean
  /** 每次 loadProject 完成自增：作为 ReactFlow 重挂 key，使 defaultViewport 生效 */
  graphVersion: number
  nodes: RFFlowNode[]
  edges: RFFlowEdge[]
  viewport: Viewport
  selectedNodeId: string | null
  isRunning: boolean
  pausedNodeId: string | null
  saveState: SaveState
  assets: AssetEntry[]
  lightbox: { url: string } | null
  inspectorOpen: boolean
  assetsOpen: boolean
  toast: Toast | null

  loadProject: (projectId: number) => Promise<void>
  getGraphSnapshot: () => GraphSnapshot
  buildGraph: () => GraphJSON
  setSaveState: (state: SaveState) => void

  setNodes: (nodes: RFFlowNode[]) => void
  applyNodesChange: (changes: NodeChange<RFFlowNode>[]) => void
  setEdges: (edges: RFFlowEdge[]) => void
  setViewport: (viewport: Viewport) => void
  selectNode: (nodeId: string | null) => void

  addNode: (type: NodeType, position: { x: number; y: number }) => string
  addEdge: (edge: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => boolean
  deleteElements: (nodeIds: string[], edgeIds: string[]) => void
  updateNodeTitle: (nodeId: string, title: string) => void
  updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => void

  copySelection: () => void
  pasteClipboard: () => void

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  beginNodeDrag: () => void
  endNodeDrag: () => void

  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  setNodeResult: (nodeId: string, result: NodeResult) => void
  clearNodeLogs: (nodeId: string) => void
  addNodeLog: (nodeId: string, level: LogEntry['level'], message: string) => void
  editNodeResult: (nodeId: string, outputKey: string | undefined, newValue: string) => void
  markDownstreamDirty: (nodeId: string) => void

  addAssets: (entries: AssetEntry[]) => void
  clearAssets: () => void

  runAll: () => Promise<void>
  runToNode: (nodeId: string) => Promise<void>
  runFromNode: (nodeId: string) => Promise<void>
  runSingleNode: (nodeId: string) => Promise<void>
  rerunNode: (nodeId: string) => Promise<void>
  stopRun: () => void
  confirmPaused: () => void

  /** 撤销栈变化计数（驱动工具栏按钮可用态） */
  historyRevision: number

  setLightbox: (url: string | null) => void
  setInspectorOpen: (open: boolean) => void
  setAssetsOpen: (open: boolean) => void
  notify: (kind: Toast['kind'], message: string) => void
  clearToast: (id: number) => void
  flush: () => Promise<void>
}

/** 剪贴板与撤销栈（模块级，不进 React 状态、不持久化） */
let clipboard: Clipboard | null = null
let past: HistorySnapshot[] = []
let future: HistorySnapshot[] = []
let pendingDrag: HistorySnapshot | null = null
let lastConfigHistory: { nodeId: string; at: number } | null = null

const genId = (prefix: string): string =>
  `${prefix}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`

const deepClone = <T>(obj: T): T => {
  try {
    return structuredClone(obj)
  } catch {
    return JSON.parse(JSON.stringify(obj)) as T
  }
}

function buildGraphRaw(nodes: RFFlowNode[], edges: RFFlowEdge[], viewport: Viewport, assets: AssetEntry[]): GraphJSON {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: deepClone(n.data),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? null,
      target: e.target,
      targetHandle: e.targetHandle ?? null,
    })),
    viewport: { ...viewport },
    assets: deepClone(assets),
  }
}

export const useRfStore = create<RfStore>((set, get) => {
  // ─── 撤销/重做 ───

  const structuralSnapshot = (): HistorySnapshot => ({
    nodes: get().nodes.map((n) => ({
      id: n.id,
      type: n.type ?? '',
      position: { x: n.position.x, y: n.position.y },
      title: n.data.title,
      config: deepClone(n.data.config),
    })),
    edges: get().edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? null,
      target: e.target,
      targetHandle: e.targetHandle ?? null,
    })),
  })

  const pushHistory = (coalesceKey?: string) => {
    const snapshot = structuralSnapshot()
    // 同一节点 1s 内连续配置编辑（逐字输入）合并为一步历史
    if (
      coalesceKey &&
      lastConfigHistory &&
      lastConfigHistory.nodeId === coalesceKey &&
      Date.now() - lastConfigHistory.at < 1000
    ) {
      lastConfigHistory = { nodeId: coalesceKey, at: Date.now() }
      return
    }
    past.push(snapshot)
    if (past.length > MAX_HISTORY) past.shift()
    future = []
    lastConfigHistory = coalesceKey ? { nodeId: coalesceKey, at: Date.now() } : null
    set((s) => ({ historyRevision: s.historyRevision + 1 }))
  }

  /** 应用快照：结构/配置回退，运行态（status/result/logs/inputs）保留现值（D10/R3.7） */
  const applySnapshot = (snapshot: HistorySnapshot) => {
    const runtimeById = new Map(get().nodes.map((n) => [n.id, n.data]))
    const nodes: RFFlowNode[] = snapshot.nodes.map((sn) => {
      const rt = runtimeById.get(sn.id)
      return {
        id: sn.id,
        type: sn.type,
        position: sn.position,
        selected: false,
        data: {
          title: sn.title,
          config: deepClone(sn.config),
          status: rt?.status ?? 'idle',
          ...(rt?.result !== undefined ? { result: rt.result } : {}),
          ...(rt?.logs !== undefined ? { logs: rt.logs } : {}),
          ...(rt?.inputs !== undefined ? { inputs: rt.inputs } : {}),
        },
      }
    })
    const edges: RFFlowEdge[] = snapshot.edges.map((e) => ({ ...e, selected: false }))
    set({ nodes, edges })
    markDirty()
  }

  // ─── dirty / 自动保存 ───

  const markDirty = () => {
    const { projectId, nodes, edges, viewport, assets } = get()
    scheduleSave(projectId, buildGraphRaw(nodes, edges, viewport, assets), nodes.length)
  }

  // ─── 图加载归一化 ───

  const normalizeGraph = (graph: unknown): { nodes: RFFlowNode[]; edges: RFFlowEdge[]; viewport: Viewport; assets: AssetEntry[] } => {
    const empty = { nodes: [] as RFFlowNode[], edges: [] as RFFlowEdge[], viewport: { x: 0, y: 0, zoom: 1 }, assets: [] as AssetEntry[] }
    if (!graph || typeof graph !== 'object') return empty
    const g = graph as Partial<GraphJSON>
    if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return empty

    const nodes: RFFlowNode[] = g.nodes
      .filter((n) => n && typeof n.id === 'string' && typeof n.type === 'string')
      .map((n) => {
        const mod = getNodeModule(n.type ?? '')
        const defaults = mod?.defaultConfig ?? {}
        const data = (n.data ?? {}) as RFFlowNode['data']
        let status = ((data.status as NodeStatus) ?? 'idle') || 'idle'
        if (status === 'running') status = 'idle'
        if (status === 'paused') status = data.result ? 'success' : 'idle'
        return {
          id: n.id,
          type: n.type,
          position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
          selected: false,
          data: {
            title: typeof data.title === 'string' && data.title ? data.title : (mod?.title ?? n.type ?? '节点'),
            status,
            config: { ...deepClone(defaults), ...(data.config ?? {}) },
            ...(data.result ? { result: data.result } : {}),
            ...(Array.isArray(data.logs) ? { logs: data.logs } : {}),
            ...(data.inputs ? { inputs: data.inputs } : {}),
          },
        }
      })

    const nodeIds = new Set(nodes.map((n) => n.id))
    const edges: RFFlowEdge[] = (g.edges as RFFlowEdge[])
      .filter((e) => e && typeof e.id === 'string' && nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? null,
        target: e.target,
        targetHandle: e.targetHandle ?? null,
        selected: false,
      }))

    const viewport =
      g.viewport && typeof g.viewport.x === 'number' && typeof g.viewport.y === 'number' && typeof g.viewport.zoom === 'number'
        ? { x: g.viewport.x, y: g.viewport.y, zoom: Math.max(0.25, Math.min(1.5, g.viewport.zoom)) }
        : { x: 0, y: 0, zoom: 1 }

    return { nodes, edges, viewport, assets: Array.isArray(g.assets) ? g.assets : [] }
  }

  // ─── 运行接线 ───

  let activeRunner: GraphRunner | null = null

  const getGraphSnapshot = (): GraphSnapshot => ({ nodes: get().nodes, edges: get().edges })

  const makeRunnerCallbacks = (): RunnerCallbacks => ({
    setNodeStatus: (nodeId, status) =>
      set((s) => ({ nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status } } : n)) })),
    setNodeResult: (nodeId, result) =>
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, result, status: 'success' } } : n)),
      })),
    clearNodeLogs: (nodeId) =>
      set((s) => ({ nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, logs: [] } } : n)) })),
    addNodeLog: (nodeId, level, message) =>
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, logs: [...(n.data.logs ?? []), { time: new Date().toISOString(), level, message }] } }
            : n
        ),
      })),
    addAssets: (entries) => get().addAssets(entries),
    notifyError: (message) => get().notify('error', message),
  })

  const startRun = async (mode: 'all' | 'to' | 'from' | 'single', nodeId?: string) => {
    if (get().isRunning) return
    set({ isRunning: true, pausedNodeId: null })
    activeRunner = new GraphRunner(getGraphSnapshot, makeRunnerCallbacks())
    try {
      if (mode === 'all') await activeRunner.runAll()
      else if (mode === 'to' && nodeId) await activeRunner.runToCurrent(nodeId)
      else if (mode === 'from' && nodeId) await activeRunner.runFromCurrent(nodeId)
      else if (mode === 'single' && nodeId) await activeRunner.runSingle(nodeId)
    } finally {
      set({ isRunning: false, pausedNodeId: activeRunner?.getPausedNodeId() ?? null })
      activeRunner = null
      markDirty()
    }
  }

  const markDownstreamDirtyImpl = (nodeId: string) => {
    const { nodes, edges } = get()
    const descendants = findDescendants(nodeId, nodes, edges)
    set((s) => ({
      nodes: s.nodes.map((n) =>
        descendants.has(n.id) && n.data.status !== 'disabled'
          ? { ...n, data: { ...n.data, status: 'dirty' as NodeStatus } }
          : n
      ),
    }))
    markDirty()
  }

  return {
    projectId: 0,
    projectName: '',
    loaded: false,
    graphVersion: 0,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    isRunning: false,
    pausedNodeId: null,
    saveState: 'saved',
    assets: [],
    lightbox: null,
    inspectorOpen: true,
    assetsOpen: false,
    toast: null,
    historyRevision: 0,

    async loadProject(projectId) {
      // 切项目前把旧项目未落盘内容 flush（scheduleSave payload 自带旧 projectId）
      await flushSave()
      past = []
      future = []
      pendingDrag = null
      set({ loaded: false, projectId, selectedNodeId: null, lightbox: null, isRunning: false, pausedNodeId: null })
      try {
        const detail = await projectApi.get(projectId)
        const normalized = normalizeGraph(detail.graph)
        set((s) => ({
          projectName: detail.name,
          nodes: normalized.nodes,
          edges: normalized.edges,
          viewport: normalized.viewport,
          assets: normalized.assets,
          loaded: true,
          graphVersion: s.graphVersion + 1,
        }))
      } catch (err) {
        console.error('[rf-canvas] 项目加载失败:', err)
        set({ projectName: '', nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, assets: [], loaded: true })
        get().notify('error', '项目加载失败，请刷新重试')
      }
    },

    getGraphSnapshot,

    buildGraph() {
      const { nodes, edges, viewport, assets } = get()
      return buildGraphRaw(nodes, edges, viewport, assets)
    },

    setSaveState(state) {
      set({ saveState: state })
    },

    setNodes(nodes) {
      set({ nodes })
    },

    applyNodesChange(changes) {
      set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
      if (changes.some((c) => c.type === 'remove')) markDirty()
    },

    setEdges(edges) {
      set({ edges })
    },

    setViewport(viewport) {
      set({ viewport })
      markDirty()
    },

    selectNode(nodeId) {
      set({ selectedNodeId: nodeId })
    },

    addNode(type, position) {
      pushHistory()
      const mod = getNodeModule(type)
      const suffix = get().nodes.filter((n) => n.type === type).length + 1
      const node: RFFlowNode = {
        id: genId('node'),
        type,
        position,
        selected: false,
        data: {
          title: `${mod?.title ?? type} ${suffix}`,
          status: 'idle',
          config: deepClone(mod?.defaultConfig ?? {}),
        },
      }
      set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: node.id }))
      markDirty()
      return node.id
    },

    addEdge(edge) {
      const { nodes, edges } = get()
      const sourceNode = nodes.find((n) => n.id === edge.source)
      const targetNode = nodes.find((n) => n.id === edge.target)
      if (!sourceNode || !targetNode || !edge.sourceHandle || !edge.targetHandle) {
        get().notify('error', '连接失败：端口不存在。')
        return false
      }
      const snapshot = getGraphSnapshot()
      const sourcePort = getNodeModule(sourceNode.type ?? '')?.getOutputs(sourceNode).find((p) => p.id === edge.sourceHandle)
      const targetPort = getNodeModule(targetNode.type ?? '')?.getInputs(targetNode, snapshot).find((p) => p.id === edge.targetHandle)
      if (!sourcePort || !targetPort) {
        get().notify('error', '连接失败：端口不存在。')
        return false
      }
      // 端口数据类型校验（Any 兼容所有类型）
      if (sourcePort.dataType !== targetPort.dataType && sourcePort.dataType !== 'Any' && targetPort.dataType !== 'Any') {
        get().notify('error', `连接失败：输出类型 ${sourcePort.dataType} 不能连接到输入类型 ${targetPort.dataType}。`)
        return false
      }
      // 目标输入端口最多 1 条入边（不允许多源汇聚）
      if (edges.some((e) => e.target === edge.target && (e.targetHandle ?? '') === edge.targetHandle)) {
        get().notify('error', '该输入端口已有连接，请先删除原连接。')
        return false
      }
      pushHistory()
      const id = `edge_${edge.source}_${edge.sourceHandle}_${edge.target}_${edge.targetHandle}`
      set((s) => ({
        edges: [...s.edges, { id, source: edge.source, sourceHandle: edge.sourceHandle, target: edge.target, targetHandle: edge.targetHandle }],
      }))
      markDirty()
      return true
    },

    deleteElements(nodeIds, edgeIds) {
      if (!nodeIds.length && !edgeIds.length) return
      pushHistory()
      const idSet = new Set(nodeIds)
      set((s) => ({
        nodes: s.nodes.filter((n) => !idSet.has(n.id)),
        edges: s.edges.filter((e) => !edgeIds.includes(e.id) && !idSet.has(e.source) && !idSet.has(e.target)),
        selectedNodeId: s.selectedNodeId && idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
      }))
      markDirty()
    },

    updateNodeTitle(nodeId, title) {
      pushHistory(nodeId)
      set((s) => ({ nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, title } } : n)) }))
      markDirty()
    },

    updateNodeConfig(nodeId, patch) {
      const node = get().nodes.find((n) => n.id === nodeId)
      if (!node) return
      const wasSuccess = node.data.status === 'success' || node.data.status === 'cached'
      pushHistory(nodeId)
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  config: { ...n.data.config, ...patch },
                  status: wasSuccess ? ('dirty' as NodeStatus) : n.data.status,
                },
              }
            : n
        ),
      }))
      markDirty()
      if (wasSuccess) markDownstreamDirtyImpl(nodeId)
    },

    copySelection() {
      const { nodes, edges } = get()
      const selected = nodes.filter((n) => n.selected)
      if (!selected.length) return
      const ids = new Set(selected.map((n) => n.id))
      clipboard = {
        nodes: selected.map((n) => ({
          id: n.id,
          type: n.type ?? '',
          position: { ...n.position },
          title: n.data.title,
          config: deepClone(n.data.config),
        })),
        edges: edges
          .filter((e) => ids.has(e.source) && ids.has(e.target))
          .map((e) => ({
            source: e.source,
            sourceHandle: e.sourceHandle ?? null,
            target: e.target,
            targetHandle: e.targetHandle ?? null,
          })),
      }
      get().notify('info', `已复制 ${selected.length} 个节点`)
    },

    pasteClipboard() {
      if (!clipboard || !clipboard.nodes.length) return
      pushHistory()
      const idMap = new Map<string, string>()
      const newNodes: RFFlowNode[] = clipboard.nodes.map((cn) => {
        const newId = genId('node')
        idMap.set(cn.id, newId)
        return {
          id: newId,
          type: cn.type,
          position: { x: cn.position.x + 20, y: cn.position.y + 20 },
          selected: false,
          data: { title: cn.title, status: 'idle' as NodeStatus, config: deepClone(cn.config) },
        }
      })
      const newEdges: RFFlowEdge[] = clipboard.edges
        .map((e): RFFlowEdge | null => {
          const source = idMap.get(e.source)
          const target = idMap.get(e.target)
          if (!source || !target || !e.sourceHandle || !e.targetHandle) return null
          return {
            id: `edge_${source}_${e.sourceHandle}_${target}_${e.targetHandle}`,
            source,
            sourceHandle: e.sourceHandle,
            target,
            targetHandle: e.targetHandle,
          }
        })
        .filter((e): e is RFFlowEdge => e !== null)
      set((s) => ({
        nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
        edges: [...s.edges, ...newEdges],
      }))
      markDirty()
    },

    undo() {
      if (!past.length || get().isRunning) return
      future.push(structuralSnapshot())
      applySnapshot(past.pop()!)
      set((s) => ({ historyRevision: s.historyRevision + 1 }))
    },

    redo() {
      if (!future.length || get().isRunning) return
      past.push(structuralSnapshot())
      applySnapshot(future.pop()!)
      set((s) => ({ historyRevision: s.historyRevision + 1 }))
    },

    canUndo() {
      return past.length > 0
    },

    canRedo() {
      return future.length > 0
    },

    beginNodeDrag() {
      pendingDrag = structuralSnapshot()
    },

    endNodeDrag() {
      if (!pendingDrag) return
      const before = pendingDrag
      pendingDrag = null
      const now = structuralSnapshot()
      const changed =
        before.nodes.length !== now.nodes.length ||
        before.edges.length !== now.edges.length ||
        before.nodes.some((bn) => {
          const current = now.nodes.find((n) => n.id === bn.id)
          return !current || current.position.x !== bn.position.x || current.position.y !== bn.position.y
        })
      if (changed) {
        past.push(before)
        if (past.length > MAX_HISTORY) past.shift()
        future = []
        markDirty()
        set((s) => ({ historyRevision: s.historyRevision + 1 }))
      }
    },

    setNodeStatus: (nodeId, status) => makeRunnerCallbacks().setNodeStatus(nodeId, status),
    setNodeResult: (nodeId, result) => makeRunnerCallbacks().setNodeResult(nodeId, result),
    clearNodeLogs: (nodeId) => makeRunnerCallbacks().clearNodeLogs(nodeId),
    addNodeLog: (nodeId, level, message) => makeRunnerCallbacks().addNodeLog(nodeId, level, message),

    editNodeResult(nodeId, outputKey, newValue) {
      const node = get().nodes.find((n) => n.id === nodeId)
      const result = node?.data.result
      if (!node || !result || result.dataType !== 'Text') return
      const value =
        outputKey && result.value && typeof result.value === 'object' && !Array.isArray(result.value)
          ? { ...(result.value as Record<string, string>), [outputKey]: newValue }
          : newValue
      const { inputHash: _dropped, ...rest } = result
      void _dropped
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== nodeId) return n
          // prompt-splitter 各段改写同步进 config.editedOutputs：重跑时保留人工改写（R5 #4）
          const config =
            n.type === 'prompt-splitter' && outputKey
              ? {
                  ...n.data.config,
                  editedOutputs: {
                    ...((n.data.config.editedOutputs as Record<string, string>) ?? {}),
                    [outputKey]: newValue,
                  },
                }
              : n.data.config
          return {
            ...n,
            data: {
              ...n.data,
              config,
              result: { ...rest, value, updatedAt: new Date().toISOString() },
            },
          }
        }),
      }))
      markDownstreamDirtyImpl(nodeId)
      markDirty()
    },

    markDownstreamDirty: (nodeId) => markDownstreamDirtyImpl(nodeId),

    addAssets(entries) {
      if (!entries.length) return
      set((s) => ({ assets: [...s.assets, ...entries] }))
      markDirty()
    },

    clearAssets() {
      set({ assets: [] })
      markDirty()
    },

    async runAll() {
      await startRun('all')
    },
    async runToNode(nodeId) {
      await startRun('to', nodeId)
    },
    async runFromNode(nodeId) {
      await startRun('from', nodeId)
    },
    async runSingleNode(nodeId) {
      await startRun('single', nodeId)
    },
    async rerunNode(nodeId) {
      // 重跑此节点：该节点 + 下游 dirty 链路重跑（上游 hash 未变走缓存复用）
      markDownstreamDirtyImpl(nodeId)
      await startRun('from', nodeId)
    },
    stopRun() {
      activeRunner?.abort()
    },
    confirmPaused() {
      activeRunner?.confirmPausedNode()
      set({ pausedNodeId: null })
    },

    setLightbox(url) {
      set({ lightbox: url ? { url } : null })
    },
    setInspectorOpen(open) {
      set({ inspectorOpen: open })
    },
    setAssetsOpen(open) {
      set({ assetsOpen: open })
    },

    notify(kind, message) {
      const toast = { id: Date.now() + Math.random(), kind, message }
      set({ toast })
      const clear = get().clearToast
      setTimeout(() => clear(toast.id), 3500)
    },

    clearToast(id) {
      const current = get().toast
      if (current && current.id === id) set({ toast: null })
    },

    async flush() {
      await flushSave()
    },
  }
})

/** 供调试/测试读取历史深度 */
export function historyDepth(): number {
  return past.length
}
