/**
 * 通用节点卡片：标题/状态角标/端口（左入右出，含类型标签）/内联摘要/结果缩略图（R7.1）。
 */
import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useRfStore, } from '../store'
import { getNodeModule, getNodeInputs, getNodeOutputs } from '../engine/nodes/registry'
import type { ImageNodeValue, RFNodeData, RFFlowNode } from '../types'

const STATUS_LABEL: Record<string, string> = {
  idle: '',
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

function NodeCardInner({ id, selected }: NodeProps<Node<RFNodeData>>) {
  const node = useRfStore((s) => s.nodes.find((n) => n.id === id)) as RFFlowNode | undefined
  const edges = useRfStore((s) => s.edges)
  const setLightbox = useRfStore((s) => s.setLightbox)

  if (!node) return null
  const mod = getNodeModule(node.type ?? '')
  const status = node.data.status
  const inputs = getNodeInputs(node, { nodes: [node], edges: edges.filter((e) => e.target === id || e.source === id) })
  const outputs = getNodeOutputs(node)
  const result = node.data.result
  const thumbs: string[] = result?.dataType === 'Image' && isImageNodeValue(result.value) ? result.value.imageList.map((a) => a.url).filter(Boolean).slice(0, 3) : []

  return (
    <div className={`rf-node st-${status} ${selected ? 'rf-node--selected' : ''}`}>
      {inputs.map((port, i) => (
        <div key={port.id} className="rf-port rf-port--in" style={{ top: `${((i + 1) / (inputs.length + 1)) * 100}%` }}>
          <Handle
            id={port.id}
            type="target"
            position={Position.Left}
            className={`rf-handle rf-handle--${port.dataType.toLowerCase()}`}
            isConnectable
          />
          <span className={`rf-port__tag rf-port__tag--${port.dataType.toLowerCase()}`}>{port.id === 'prompt' ? 'Prompt' : port.name}</span>
        </div>
      ))}

      <div className="rf-node__head">
        <span className="rf-node__icon" data-node-type={node.type} />
        <span className="rf-node__title">{node.data.title}</span>
        {STATUS_LABEL[status] ? (
          <span className={`rf-node__badge rf-node__badge--${status}`}>
            {status === 'running' ? <span className="rf-spin" /> : null}
            {STATUS_LABEL[status]}
          </span>
        ) : null}
      </div>
      <div className="rf-node__type">{mod?.title ?? node.type}</div>
      <div className="rf-node__summary">{mod?.getSummary(node) ?? ''}</div>

      {thumbs.length > 0 && (
        <div className="rf-node__thumbs">
          {thumbs.map((url) => (
            <img
              key={url}
              src={url}
              alt="结果图"
              className="rf-node__thumb"
              onClick={(e) => {
                e.stopPropagation()
                setLightbox(url)
              }}
            />
          ))}
        </div>
      )}

      {outputs.map((port, i) => (
        <div key={port.id} className="rf-port rf-port--out" style={{ top: `${((i + 1) / (outputs.length + 1)) * 100}%` }}>
          <span className={`rf-port__tag rf-port__tag--${port.dataType.toLowerCase()}`}>{port.name}</span>
          <Handle
            id={port.id}
            type="source"
            position={Position.Right}
            className={`rf-handle rf-handle--${port.dataType.toLowerCase()}`}
            isConnectable
          />
        </div>
      ))}
    </div>
  )
}

export const NodeCard = memo(NodeCardInner)
