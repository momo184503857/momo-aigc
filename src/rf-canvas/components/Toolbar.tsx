/**
 * 顶部工具栏（R7.5/R5.4/R8）：添加节点 / 四模式运行与停止 / 撤销重做 / 适配视图 / 成果面板 / 保存状态。
 */
import { useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useRfStore } from '../store'
import { getNodeModule, NODE_ORDER } from '../engine/nodes/registry'
import { ensureImageCatalog } from '../catalogSync'
import type { NodeType } from '../types'

export function Toolbar() {
  const isRunning = useRfStore((s) => s.isRunning)
  const pausedNodeId = useRfStore((s) => s.pausedNodeId)
  const selectedNodeId = useRfStore((s) => s.selectedNodeId)
  const saveState = useRfStore((s) => s.saveState)
  const assetsOpen = useRfStore((s) => s.assetsOpen)
  const historyRevision = useRfStore((s) => s.historyRevision)
  const state = useRfStore
  const { fitView } = useReactFlow()

  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!addOpen) return
    const onDown = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addOpen])

  const addNode = (type: NodeType) => {
    // 画布中心放置（视口中心 → flow 坐标）
    const vp = state.getState().viewport
    const canvas = document.querySelector('.rf-canvas-wrap') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    const cx = (rect?.width ?? 800) / 2
    const cy = (rect?.height ?? 600) / 2
    state.getState().addNode(type, { x: (cx - vp.x) / vp.zoom, y: (cy - vp.y) / vp.zoom })
    setAddOpen(false)
    void ensureImageCatalog()
  }

  const saveLabel: Record<string, string> = {
    saved: '已保存',
    pending: '待保存…',
    saving: '保存中…',
    error: '保存失败',
  }

  return (
    <div className="rf-toolbar">
      <div className="rf-toolbar__group" ref={addRef}>
        <button className="rf-btn rf-btn--primary" onClick={() => setAddOpen((v) => !v)}>
          ＋ 添加节点
        </button>
        {addOpen && (
          <div className="rf-dropdown">
            {NODE_ORDER.map((type) => (
              <button key={type} className="rf-dropdown__item" onClick={() => addNode(type)}>
                <span>{getNodeModule(type)?.title}</span>
                <span className="rf-dropdown__desc">{getNodeModule(type)?.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rf-toolbar__group">
        {isRunning ? (
          <button className="rf-btn rf-btn--danger" onClick={() => state.getState().stopRun()}>
            ■ 停止
          </button>
        ) : (
          <button
            className="rf-btn rf-btn--primary"
            onClick={() => {
              void ensureImageCatalog()
              void state.getState().runAll()
            }}
          >
            ▶ 运行全部
          </button>
        )}
        <button
          className="rf-btn"
          disabled={isRunning || !selectedNodeId}
          title={selectedNodeId ? '运行选中节点及其全部上游' : '先选中一个节点'}
          onClick={() => selectedNodeId && void state.getState().runToNode(selectedNodeId)}
        >
          运行到选中
        </button>
        <button
          className="rf-btn"
          disabled={isRunning || !selectedNodeId}
          title={selectedNodeId ? '运行选中节点及其全部下游' : '先选中一个节点'}
          onClick={() => selectedNodeId && void state.getState().runFromNode(selectedNodeId)}
        >
          从选中继续
        </button>
        <button
          className="rf-btn"
          disabled={isRunning || !selectedNodeId}
          title={selectedNodeId ? '仅运行选中节点' : '先选中一个节点'}
          onClick={() => selectedNodeId && void state.getState().runSingleNode(selectedNodeId)}
        >
          单节点运行
        </button>
        {pausedNodeId && !isRunning ? (
          <button className="rf-btn rf-btn--warning" onClick={() => state.getState().confirmPaused()}>
            继续暂停节点
          </button>
        ) : null}
        {isRunning ? <span className="rf-toolbar__running">运行中…</span> : null}
      </div>

      <div className="rf-toolbar__group" data-history-rev={historyRevision}>
        <button className="rf-btn" disabled={!state.getState().canUndo() || isRunning} onClick={() => state.getState().undo()} title="撤销 (Ctrl+Z)">
          ↶ 撤销
        </button>
        <button className="rf-btn" disabled={!state.getState().canRedo() || isRunning} onClick={() => state.getState().redo()} title="重做 (Ctrl+Shift+Z / Ctrl+Y)">
          ↷ 重做
        </button>
        <button className="rf-btn" onClick={() => void fitView({ padding: 0.25 })}>
          适配视图
        </button>
      </div>

      <div className="rf-toolbar__spacer" />

      <div className="rf-toolbar__group">
        <button className={`rf-btn ${assetsOpen ? 'rf-btn--active' : ''}`} onClick={() => state.getState().setAssetsOpen(!assetsOpen)}>
          成果面板
        </button>
        <span className={`rf-save rf-save--${saveState}`}>{saveLabel[saveState] ?? ''}</span>
      </div>
    </div>
  )
}
