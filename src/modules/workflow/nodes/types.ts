import type { NodePort, NodeResult, WorkflowModel, WorkflowNode } from '@/modules/workflow/types/workflow'

/**
 * 节点运行结果
 */
export interface NodeRunSuccess {
  success: true
  result: NodeResult
  outputs?: NodePort[]
  logs?: Array<{ level: 'info' | 'warn' | 'error'; message: string }>
  /**
   * 质检重试请求：整轮执行结束后由执行器统一应用（写回目标节点 config 的修正字段），
   * 再自动加跑一轮；输入哈希缓存保证只有被修正节点及其下游真正重跑。
   */
  retry?: Array<{
    /** 需要修正重跑的节点 id（通常是本节点的上游） */
    nodeId: string
    /** 修正指令（拼进目标节点的提示词） */
    feedback: string
    /** 回合耗尽仍失败时，是否把本（质检）节点置为 failed 并中止工作流 */
    strict?: boolean
  }>
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
