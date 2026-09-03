/**
 * 节点模块契约：8 种节点（R5 表）的端口/默认配置/运行逻辑单一来源（registry）。
 * Panel 组件不经此处引用（见 components/panels/index.tsx），避免与 store 循环依赖。
 */
import type { AssetEntry, LogEntry, NodeResult, NodeType, PortDef, RFFlowNode } from '../../types'
import type { GraphSnapshot, ResolvedInput } from '../graph'

export interface NodeRunContext {
  graph: GraphSnapshot
  node: RFFlowNode
  inputs: Record<string, ResolvedInput>
  /** 软停止信号：停止后取消在途网络请求/后续轮询（R6.8） */
  signal: AbortSignal
  addLog: (level: LogEntry['level'], message: string) => void
  /** 成果面板写入（save 节点用，D5：不写 canvas_assets） */
  addAssets: (entries: AssetEntry[]) => void
}

export type NodeRunResult =
  | { success: true; result: NodeResult; logs?: LogEntry[] }
  | { success: false; message: string; retryable?: boolean; logs?: LogEntry[] }

export interface NodeModule {
  type: NodeType
  title: string
  description: string
  /** 输入端口（image-ai 按已连参考图数动态扩展，上限=所选逻辑模型 maxReferenceImages） */
  getInputs(node: RFFlowNode, graph: GraphSnapshot): PortDef[]
  /** 输出端口（prompt-splitter 按上次结果动态生成 output_1..N） */
  getOutputs(node: RFFlowNode): PortDef[]
  defaultConfig: Record<string, unknown>
  /** 节点卡片内联摘要 */
  getSummary(node: RFFlowNode): string
  run(ctx: NodeRunContext): Promise<NodeRunResult>
}

export interface PortRef {
  nodeId: string
  portId: string
}

export function portTypeCompatible(source: PortDef, target: PortDef): boolean {
  if (source.dataType !== target.dataType && source.dataType !== 'Any' && target.dataType !== 'Any') {
    return false
  }
  return true
}
