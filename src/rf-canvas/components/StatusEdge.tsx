/**
 * 状态边（R7.2）：颜色跟随来源节点状态；来源运行中时 animated 流动。
 */
import { memo } from 'react'
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { useRfStore } from '../store'

function statusColor(status: string | undefined): string {
  switch (status) {
    case 'running':
      return 'var(--momo-color-brand)'
    case 'success':
    case 'cached':
      return 'var(--momo-color-success)'
    case 'failed':
      return 'var(--momo-color-danger)'
    case 'paused':
    case 'dirty':
      return 'var(--momo-color-warning)'
    default:
      return 'var(--momo-color-border)'
  }
}

function StatusEdgeInner({ id, source, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const sourceStatus = useRfStore((s) => s.nodes.find((n) => n.id === source)?.data.status)
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const color = selected ? 'var(--momo-color-brand)' : statusColor(sourceStatus)
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: color,
        strokeWidth: selected ? 2.5 : 2,
      }}
      className={sourceStatus === 'running' ? 'rf-edge--animated' : undefined}
    />
  )
}

export const StatusEdge = memo(StatusEdgeInner)
