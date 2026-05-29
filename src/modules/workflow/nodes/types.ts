import type { NodePort, NodeResult, WorkflowModel, WorkflowNode } from '@/modules/workflow/types/workflow'

/**
 * 节点运行结果
 */
export interface NodeRunSuccess {
  success: true
  result: NodeResult
  outputs?: NodePort[]
  logs?: Array<{ level: 'info' | 'warn' | 'error'; message: string }>
}

export interface NodeRunFailure {
  success: false
  message: string
  logs?: Array<{
    level: 'info' | 'warn' | 'error'
    message: string
    request?: unknown
    response?: unknown
  }>
}

export type NodeRunResult = NodeRunSuccess | NodeRunFailure

/**
 * 节点模块接口 — 每个节点类型必须实现
 */
export interface NodeModule {
  /** 节点类型标识 */
  type: string
  /** 显示标题 */
  title: string
  /** 节点描述 */
  description: string
  /** 图标组件名 (Element Plus icon) */
  icon: string
  /** 主题色 (hex) */
  color: string
  /** 默认输入端口 */
  inputs: NodePort[]
  /** 默认输出端口 */
  outputs: NodePort[]
  /** 默认配置 */
  defaultConfig: Record<string, unknown>
  /** 获取配置摘要（显示在节点上） */
  getSummary: (config: Record<string, unknown>) => string
  /** 执行节点逻辑 */
  run: (workflow: WorkflowModel, node: WorkflowNode, inputs: Record<string, unknown>) => Promise<NodeRunResult>
}
