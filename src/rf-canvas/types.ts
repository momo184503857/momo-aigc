/**
 * AI画布 Pro+ 类型契约（技术方案 §6.2）。
 * GraphJSON 为持久化形状：nodes/edges/viewport（+ 成果面板条目），随项目存取。
 */
import type { Node, Edge } from '@xyflow/react'

export type PortType = 'Text' | 'Image' | 'Any'

export type NodeStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'paused'
  | 'dirty'
  | 'disabled'
  | 'cached'

export type NodeType =
  | 'text-input'
  | 'image-input'
  | 'text-ai'
  | 'prompt-splitter'
  | 'image-ai'
  | 'text-preview'
  | 'image-preview'
  | 'save'

export interface PortDef {
  id: string
  name: string
  dataType: PortType
  direction: 'input' | 'output'
  required?: boolean
}

export interface ImageAsset {
  /** 站内存储 URL（direct: /api/files/... 或 oss: bucket 域名）；不存 base64 进图 JSON（R5） */
  url: string
  fileName: string
}

/** Image 结果值 */
export interface ImageNodeValue {
  imageList: ImageAsset[]
  /** 生图任务号（image-ai） */
  taskNo?: string
}

/** Text 结果值：普通文本为 string；prompt-splitter 为「输出端口 id → 文本」映射 */
export type TextNodeValue = string | Record<string, string>

export interface NodeResult {
  dataType: 'Text' | 'Image'
  value: TextNodeValue | ImageNodeValue
  updatedAt: string
  /** 缓存键（type+config+inputs hash），编辑结果后删除以强制重跑 */
  inputHash?: string
}

export interface LogEntry {
  time: string
  level: 'info' | 'warn' | 'error'
  message: string
}

// ─── 各节点 config（R5 表）───

export interface TextInputConfig {
  text: string
}

export interface ImageInputConfig {
  images: ImageAsset[]
}

export interface TextAiConfig {
  /** 文字渠道模型 id（数字，来自目录 kind=text；禁止存模型名字符串） */
  channelModelId: number | null
  taskPrompt: string
  detailPrompt: string
  pauseAfterRun: boolean
  temperature?: number
  maxTokens?: number
}

export interface PromptSplitterConfig {
  delimiter: string
  /** 剥除 <think>…</think> 块（默认开） */
  stripThinkBlocks: boolean
  pauseAfterRun: boolean
  /** 人工改写各段：输出端口 id → 改写后文本 */
  editedOutputs: Record<string, string>
}

export interface ImageAiConfig {
  /** 逻辑模型 id（数字，来自目录 kind=image；禁止存模型名字符串） */
  logicalModelId: number | null
  aspectRatio: string
  resolution: string
  /** 张数 1–5 */
  n: number
}

// ─── React Flow 节点 data ───

export interface RFNodeData extends Record<string, unknown> {
  title: string
  status: NodeStatus
  config: Record<string, unknown>
  result?: NodeResult
  /** 上游结果快照（端口页签展示 + 缓存 hash 输入） */
  inputs?: Record<string, unknown>
  logs?: LogEntry[]
}

export type RFFlowNode = Node<RFNodeData>
export type RFFlowEdge = Edge

export interface Viewport {
  x: number
  y: number
  zoom: number
}

/** 成果面板条目（save 节点产出，随 graph 持久化；不写 canvas_assets 表） */
export interface AssetEntry {
  id: string
  kind: 'image' | 'text'
  url?: string
  fileName?: string
  text?: string
  nodeTitle: string
  createdAt: string
}

export interface GraphJSON {
  nodes: RFFlowNode[]
  edges: RFFlowEdge[]
  viewport: Viewport
  assets?: AssetEntry[]
}

// ─── 模型目录（api.ts 返回形状，字段以 /api/models/catalog 现源码为准）───

export interface ImageCatalogModel {
  id: number
  modelId: string
  displayName: string
  logicalCode: string
  capabilities: {
    resolutions: string[]
    aspectRatiosByResolution: Record<string, string[]>
    maxReferenceImages: number
    maxPromptChars: number
  }
  pricing: Record<string, number>
  kind: 'image'
}

export interface TextCatalogModel {
  id: number
  modelId: string
  displayName: string
  logicalCode: string | null
  kind: 'text'
}

export interface TextCatalogGroup {
  providerId: number
  /** 渠道展示别名（如 TA / CA） */
  providerName: string
  adapter: string
  models: TextCatalogModel[]
}
