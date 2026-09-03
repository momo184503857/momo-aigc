/**
 * 检查器（R7.3）：配置 / 端口 / 结果 / 日志 四页签，可折叠。
 */
import { useMemo, useState } from 'react'
import { useRfStore } from '../store'
import { getNodeModule, getNodeInputs, getNodeOutputs } from '../engine/nodes/registry'
import { resolveNodeInputs } from '../engine/graph'
import { ConfigPanelFor } from './panels'
import type { ImageNodeValue, RFFlowNode } from '../types'

type TabKey = 'config' | 'ports' | 'result' | 'logs'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'config', label: '配置' },
  { key: 'ports', label: '端口' },
  { key: 'result', label: '结果' },
  { key: 'logs', label: '日志' },
]

const STATUS_LABEL: Record<string, string> = {
  idle: '空闲',
  running: '运行中',
  success: '成功',
  failed: '失败',
  paused: '已暂停',
  dirty: '待更新',
  disabled: '禁用',
  cached: '缓存复用',
}

function isImageNodeValue(value: unknown): value is ImageNodeValue {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as Record<string, unknown>).imageList)
}

function ResultTextEditor({ nodeId, outputKey, initial }: { nodeId: string; outputKey: string | undefined; initial: string }) {
  const [value, setValue] = useState(initial)
  const editNodeResult = useRfStore((s) => s.editNodeResult)
  return (
    <textarea
      className="rf-input rf-input--area"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initial) editNodeResult(nodeId, outputKey, value)
      }}
      rows={Math.min(12, Math.max(3, Math.ceil(value.length / 40)))}
    />
  )
}

function ImageResultView({ node }: { node: RFFlowNode }) {
  const result = node.data.result
  const setLightbox = useRfStore((s) => s.setLightbox)
  const state = useRfStore
  if (!result || result.dataType !== 'Image' || !isImageNodeValue(result.value)) return null
  const value = result.value
  return (
    <>
      {value.taskNo ? (
        <button
          className="rf-btn rf-btn--sm rf-result__taskno"
          title="点击复制任务号"
          onClick={() => {
            void navigator.clipboard.writeText(value.taskNo!)
            state.getState().notify('info', '任务号已复制')
          }}
        >
          任务号：{value.taskNo}（点击复制）
        </button>
      ) : null}
      <div className="rf-result__imgs">
        {value.imageList.map((img: { url: string; fileName: string }) => (
          <img key={img.url} src={img.url} alt={img.fileName} className="rf-result__img" onClick={() => setLightbox(img.url)} />
        ))}
      </div>
    </>
  )
}

export function InspectorPanel() {
  const open = useRfStore((s) => s.inspectorOpen)
  const selectedNodeId = useRfStore((s) => s.selectedNodeId)
  const node = useRfStore((s) => (s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : undefined))
  const nodes = useRfStore((s) => s.nodes)
  const edges = useRfStore((s) => s.edges)
  const setLightbox = useRfStore((s) => s.setLightbox)
  const clearNodeLogs = useRfStore((s) => s.clearNodeLogs)
  const pausedNodeId = useRfStore((s) => s.pausedNodeId)
  const confirmPaused = useRfStore((s) => s.confirmPaused)
  const state = useRfStore
  const [tab, setTab] = useState<TabKey>('config')

  const inputs = useMemo(
    () => (node ? resolveNodeInputs({ nodes, edges }, node.id) : {}),
    [node, nodes, edges]
  )

  if (!open) {
    return (
      <button className="rf-inspector__open" title="展开检查器" onClick={() => state.getState().setInspectorOpen(true)}>
        检查器 ›
      </button>
    )
  }

  return (
    <aside className="rf-inspector">
      <div className="rf-inspector__head">
        <span className="rf-inspector__title">{node ? node.data.title : '检查器'}</span>
        <button className="rf-btn rf-btn--sm" onClick={() => state.getState().setInspectorOpen(false)} title="折叠">
          ›
        </button>
      </div>

      {!node ? (
        <div className="rf-inspector__empty">点击画布中的节点查看配置、端口、结果与日志。</div>
      ) : (
        <>
          <div className="rf-inspector__meta">
            <span className={`rf-node__badge rf-node__badge--${node.data.status}`}>
              {node.data.status === 'running' ? <span className="rf-spin" /> : null}
              {STATUS_LABEL[node.data.status] ?? node.data.status}
            </span>
            <span className="rf-inspector__type">{getNodeModule(node.type ?? '')?.title}</span>
          </div>

          {pausedNodeId === node.id && (
            <button className="rf-btn rf-btn--warning rf-inspector__resume" onClick={confirmPaused}>
              继续运行
            </button>
          )}

          <div className="rf-tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`rf-tabs__tab ${tab === t.key ? 'rf-tabs__tab--active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="rf-inspector__body">
            {tab === 'config' && <ConfigPanelFor node={node} />}

            {tab === 'ports' && (
              <div className="rf-ports">
                <div className="rf-ports__group">输入端口</div>
                {getNodeInputs(node, { nodes, edges }).length === 0 && <div className="rf-ports__empty">无</div>}
                {getNodeInputs(node, { nodes, edges }).map((port) => {
                  const input = inputs[port.id]
                  return (
                    <div key={port.id} className="rf-ports__row">
                      <span className={`rf-port__tag rf-port__tag--${port.dataType.toLowerCase()}`}>{port.name}</span>
                      <span className="rf-ports__src">{input ? `← ${input.sourceTitle}` : '未连接'}</span>
                    </div>
                  )
                })}
                <div className="rf-ports__group">输出端口</div>
                {getNodeOutputs(node).length === 0 && <div className="rf-ports__empty">无</div>}
                {getNodeOutputs(node).map((port) => (
                  <div key={port.id} className="rf-ports__row">
                    <span className={`rf-port__tag rf-port__tag--${port.dataType.toLowerCase()}`}>{port.name}</span>
                    <span className="rf-ports__src">{port.dataType}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'result' && (
              <div className="rf-result">
                {!node.data.result && <div className="rf-ports__empty">尚未运行，无结果。</div>}
                {node.data.result?.dataType === 'Text' &&
                  (node.data.result.value && typeof node.data.result.value === 'object' && !Array.isArray(node.data.result.value) ? (
                    Object.entries(node.data.result.value as Record<string, string>).map(([key, text]) => (
                      <div key={key} className="rf-result__section">
                        <div className="rf-result__label">{key}</div>
                        <ResultTextEditor nodeId={node.id} outputKey={key} initial={text} />
                      </div>
                    ))
                  ) : (
                    <ResultTextEditor nodeId={node.id} outputKey={undefined} initial={String(node.data.result.value ?? '')} />
                  ))}
                {node.data.result?.dataType === 'Image' && <ImageResultView node={node} />}
              </div>
            )}

            {tab === 'logs' && (
              <div className="rf-logs">
                <div className="rf-logs__bar">
                  <span>{(node.data.logs ?? []).length} 条</span>
                  <button className="rf-btn rf-btn--sm" disabled={!(node.data.logs ?? []).length} onClick={() => clearNodeLogs(node.id)}>
                    清空
                  </button>
                </div>
                {(node.data.logs ?? []).length === 0 ? (
                  <div className="rf-ports__empty">暂无日志。</div>
                ) : (
                  (node.data.logs ?? []).map((log, i) => (
                    <div key={i} className={`rf-log rf-log--${log.level}`}>
                      <span className="rf-log__time">{log.time.slice(11, 19)}</span>
                      <span className="rf-log__msg">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
