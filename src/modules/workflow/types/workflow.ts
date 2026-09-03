export type PortDataType = 'Text' | 'Image' | 'Any'

export type NodeStatus =
  | 'idle'
  | 'waiting'
  | 'running'
  | 'success'
  | 'failed'
  | 'disabled'
  | 'affected'
  | 'dirty'
  | 'paused'

export type NodeType =
  | 'image-input'
  | 'text-input'
  | 'text-ai'
  | 'prompt-splitter'
  | 'image-ai'
  | 'text-preview'
  | 'image-preview'
  | 'save'

export interface WorkflowPosition {
  x: number
  y: number
}

export interface LocalImageAsset {
  id: string
  fileName: string
  localPath: string
  previewUrl: string
  width?: number
  height?: number
}

export interface ImageInputNodeConfig {
  images: LocalImageAsset[]
}

export interface TextInputNodeConfig {
  text: string
}

export interface TextAiNodeConfig {
  modelName: string
  /** 渠道模型数字 id（目录 textGroups 的 m.id；优先于 modelName 解析，改名/下架不受影响） */
  channelModelId?: number
  taskPrompt: string
  detailPrompt: string
  pauseAfterRun: boolean
  temperature?: number
  maxTokens?: number
}

export interface PromptSplitterNodeConfig {
  delimiter: string
  trimWhitespace: boolean
  ignoreEmpty: boolean
  editedOutputs: Record<string, string>
}

export interface ImageAiNodeConfig {
  modelName: string
  /** 逻辑模型数字 id（目录 imageGroups 的 m.id；优先于 modelName 解析，改名/下架不受影响） */
  logicalModelId?: number
  aspectRatio: string
  outputSize: string
  imageCount: number
}

export interface SaveNodeConfig {
  saveDir?: string
}

export interface ImageNodeResultValue {
  image?: LocalImageAsset
  imageList: LocalImageAsset[]
}

export interface WorkflowInputValue {
  sourceNodeId: string
  sourcePortId: string
  targetPortId: string
  result: NodeResult
}

export interface NodePort {
  id: string
  name: string
  dataType: PortDataType
  direction: 'input' | 'output'
  required?: boolean
}

export interface NodeResult {
  dataType: PortDataType
  value: unknown
  updatedAt: string
  inputHash?: string
}

export interface NodeLog {
  id: string
  nodeId: string
  level: 'info' | 'warn' | 'error'
  message: string
  startedAt?: string
  endedAt?: string
  durationMs?: number
  retryIndex?: number
  request?: unknown
  response?: unknown
  error?: unknown
}

export interface WorkflowNode {
  id: string
  type: NodeType
  title: string
  position: WorkflowPosition
  inputs: NodePort[]
  outputs: NodePort[]
  config: Record<string, unknown>
  status: NodeStatus
  disabled: boolean
  result?: NodeResult
  logs: NodeLog[]
  width?: number
  height?: number
}

export interface WorkflowEdge {
  id: string
  sourceNodeId: string
  sourcePortId: string
  targetNodeId: string
  targetPortId: string
}

export interface WorkflowViewport {
  x: number
  y: number
  zoom: number
}

export interface WorkflowModel {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** 画布视口（平移/缩放），重开项目时恢复 */
  viewport?: WorkflowViewport
  updatedAt: string
}

export interface NodeDefinition {
  type: NodeType
  title: string
  description: string
  inputs: NodePort[]
  outputs: NodePort[]
  defaultConfig: Record<string, unknown>
}

export interface ValidationResult {
  valid: boolean
  message?: string
}

export interface WorkflowCanvasNodeData {
  workflowNode: WorkflowNode
}

export interface WorkflowCanvasEdgeData {
  workflowEdge: WorkflowEdge
}
