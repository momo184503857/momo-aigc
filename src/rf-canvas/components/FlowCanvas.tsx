/**
 * 画布（R3/R4）：ReactFlow + 端口校验连线 + 右键菜单 + 快捷键 + MiniMap/Controls/背景网格/吸附。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnConnect,
  type Viewport,
} from '@xyflow/react'
import { useRfStore } from '../store'
import { NodeCard } from './NodeCard'
import { StatusEdge } from './StatusEdge'
import { getNodeModule, getNodeInputs, getNodeOutputs, NODE_ORDER } from '../engine/nodes/registry'
import { wouldCreateCycle } from '../engine/graph'
import type { NodeType } from '../types'

// 8 个语义节点类型共用同一 NodeCard 渲染器（node.type 即语义类型，引擎/注册表直接消费）
const nodeTypes: Record<string, typeof NodeCard> = Object.fromEntries(
  NODE_ORDER.map((type) => [type as string, NodeCard])
) as Record<NodeType, typeof NodeCard>
const edgeTypes = { rfEdge: StatusEdge }

interface ContextMenuState {
  /** 相对画布容器的坐标 */
  x: number
  y: number
  flowPosition: { x: number; y: number }
  nodeId?: string
}

export function FlowCanvas() {
  const nodes = useRfStore((s) => s.nodes)
  const edges = useRfStore((s) => s.edges)
  const viewport = useRfStore((s) => s.viewport)
  const graphVersion = useRfStore((s) => s.graphVersion)
  const store = useRfStore
  const { screenToFlowPosition, setViewport } = useReactFlow()

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  // 项目加载完成后程序化恢复持久化视口（不重挂 ReactFlow：重挂会导致节点测量链路失效）
  useEffect(() => {
    if (graphVersion > 0) void setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom }, { duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphVersion])

  // ─── 连线：校验在 isValidConnection（拖拽时即时反馈），落线走 onConnect（R3.2）───
  const isValidConnection = useCallback<IsValidConnection<Edge>>(
    (connection) => {
      const state = store.getState()
      const { nodes: ns, edges: es } = state
      if (!connection.sourceHandle || !connection.targetHandle) return false
      if (connection.source === connection.target) return false
      const sourceNode = ns.find((n) => n.id === connection.source)
      const targetNode = ns.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return false

      const snapshot = { nodes: ns, edges: es }
      const sourcePort = getNodeOutputs(sourceNode).find((p) => p.id === connection.sourceHandle)
      const targetPort = getNodeInputs(targetNode, snapshot).find((p) => p.id === connection.targetHandle)
      if (!sourcePort || !targetPort) return false
      // 端口数据类型：Any 兼容所有类型，其余必须同类型
      if (sourcePort.dataType !== targetPort.dataType && sourcePort.dataType !== 'Any' && targetPort.dataType !== 'Any') return false
      // 目标输入端口最多 1 条入边
      if (es.some((e) => e.target === connection.target && (e.targetHandle ?? '') === connection.targetHandle)) return false
      if (wouldCreateCycle(es, { source: connection.source, target: connection.target })) {
        state.notify('error', '不支持循环：该连线会产生环形依赖。')
        return false
      }
      return true
    },
    [store]
  )

  const onConnect = useCallback<OnConnect>(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return
      store.getState().addEdge({
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      })
    },
    [store]
  )

  // ─── 快捷键（R3.4/R3.5/R3.6）：Delete / Ctrl+Z/Y / Ctrl+C/V ───
  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const state = store.getState()
      const mod = e.ctrlKey || e.metaKey

      if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        const nodeIds = state.nodes.filter((n) => n.selected).map((n) => n.id)
        const edgeIds = state.edges.filter((ed) => ed.selected).map((ed) => ed.id)
        if (nodeIds.length || edgeIds.length) {
          e.preventDefault()
          state.deleteElements(nodeIds, edgeIds)
        }
        return
      }

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        state.undo()
        return
      }
      if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        state.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        if (state.nodes.some((n) => n.selected)) {
          e.preventDefault()
          state.copySelection()
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        state.pasteClipboard()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])

  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, nodeId?: string) => {
      event.preventDefault()
      const rect = wrapperRef.current?.getBoundingClientRect()
      const x = event.clientX - (rect?.left ?? 0)
      const y = event.clientY - (rect?.top ?? 0)
      setMenu({ x, y, flowPosition: screenToFlowPosition({ x: event.clientX, y: event.clientY }), nodeId })
    },
    [screenToFlowPosition]
  )

  const addNodeAtMenu = (type: NodeType) => {
    const position = menu?.flowPosition ?? { x: 100, y: 100 }
    store.getState().addNode(type, position)
    closeMenu()
  }

  return (
    <div className="rf-canvas-wrap" ref={wrapperRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={viewport as Viewport}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodesChange={(changes) => store.getState().applyNodesChange(changes)}
        onEdgesChange={(changes: EdgeChange[]) => {
          // 仅接受选择类变更；删除统一走快捷键/右键（store.deleteElements 走撤销栈）
          const selectionOnly = changes.filter((c) => c.type === 'select')
          if (!selectionOnly.length) return
          const state = store.getState()
          state.setEdges(
            state.edges.map((e) => {
              const change = selectionOnly.find((c) => c.id === e.id)
              return change ? { ...e, selected: change.selected } : e
            })
          )
        }}
        onNodeDragStart={() => store.getState().beginNodeDrag()}
        onNodeDragStop={() => store.getState().endNodeDrag()}
        onNodeClick={(_, node) => store.getState().selectNode(node.id)}
        onPaneClick={() => {
          store.getState().selectNode(null)
          closeMenu()
        }}
        onMoveEnd={(_, vp) => store.getState().setViewport(vp)}
        onPaneContextMenu={(event) => openMenu(event)}
        onNodeContextMenu={((event: React.MouseEvent, node: { id: string }) => openMenu(event, node.id)) as NodeMouseHandler}
        minZoom={0.25}
        maxZoom={1.5}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={null}
        multiSelectionKeyCode={['Control', 'Meta']}
        selectionKeyCode="Shift"
        selectionOnDrag
        panOnDrag={[1, 2]}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        className="rf-flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="rf-bg" />
        <Controls position="bottom-left" showInteractive />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          className="rf-minimap"
          nodeClassName={(n) => `rf-minimap__node st-${(n.data as { status?: string })?.status ?? 'idle'}`}
        />
      </ReactFlow>

      {menu && (
        <>
          <div className="rf-ctx-overlay" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu() }} />
          <div className="rf-ctx-menu" style={{ left: menu.x, top: menu.y }}>
            {menu.nodeId ? (
              <NodeContextMenuItems nodeId={menu.nodeId} onAction={closeMenu} />
            ) : (
              <>
                <div className="rf-ctx-menu__title">添加节点</div>
                {NODE_ORDER.map((type) => (
                  <button key={type} className="rf-ctx-menu__item" onClick={() => addNodeAtMenu(type)}>
                    <span>{getNodeModule(type)?.title}</span>
                    <span className="rf-ctx-menu__desc">{getNodeModule(type)?.description}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NodeContextMenuItems({ nodeId, onAction }: { nodeId: string; onAction: () => void }) {
  const isRunning = useRfStore((s) => s.isRunning)
  const pausedNodeId = useRfStore((s) => s.pausedNodeId)
  const state = useRfStore
  const node = useRfStore((s) => s.nodes.find((n) => n.id === nodeId))
  const mod = getNodeModule(node?.type ?? '')
  return (
    <>
      <div className="rf-ctx-menu__title">{mod?.title ?? '节点'}</div>
      <button
        className="rf-ctx-menu__item"
        disabled={isRunning}
        onClick={() => {
          void state.getState().runToNode(nodeId)
          onAction()
        }}
      >
        运行到此处（含全部上游）
      </button>
      <button
        className="rf-ctx-menu__item"
        disabled={isRunning}
        onClick={() => {
          void state.getState().runFromNode(nodeId)
          onAction()
        }}
      >
        从此继续（含全部下游）
      </button>
      <button
        className="rf-ctx-menu__item"
        disabled={isRunning}
        onClick={() => {
          void state.getState().runSingleNode(nodeId)
          onAction()
        }}
      >
        单节点运行
      </button>
      <button
        className="rf-ctx-menu__item"
        disabled={isRunning}
        onClick={() => {
          void state.getState().rerunNode(nodeId)
          onAction()
        }}
      >
        重跑此节点（含下游 dirty）
      </button>
      {pausedNodeId === nodeId ? (
        <button
          className="rf-ctx-menu__item"
          onClick={() => {
            state.getState().confirmPaused()
            onAction()
          }}
        >
          继续
        </button>
      ) : null}
      <button
        className="rf-ctx-menu__item"
        onClick={() => {
          state.getState().selectNode(nodeId)
          state.getState().copySelection()
          onAction()
        }}
      >
        复制
      </button>
      <button
        className="rf-ctx-menu__item rf-ctx-menu__item--danger"
        onClick={() => {
          state.getState().deleteElements([nodeId], [])
          onAction()
        }}
      >
        删除
      </button>
    </>
  )
}
