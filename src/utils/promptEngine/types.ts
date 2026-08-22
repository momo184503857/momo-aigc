/**
 * 提示词组装引擎 · 类型定义。
 *
 * 一条完整 Prompt = Σ 启用的模板条目（按 grp + order 排序）
 *                + 上下文动态填充（{{persona.dna}} 等占位符）
 * order >= 1000 的条目视为「点位差异条目」，仅出现在每张点位文本中。
 * 引擎为纯函数：零 UI / 网络 / store 依赖。
 */

export type PromptGroup =
  | 'identity' | 'garment' | 'scene' | 'light' | 'pose' | 'camera'
  | 'quality' | 'negative' | 'fusion' | 'fidelity'

export interface PromptEntry {
  key: string
  name: string
  grp: PromptGroup
  order: number
  content: string
  /** 启用条件：none=恒启用 */
  condKind?: string
  /** 适用模型（空=全部） */
  models?: string[]
  /** 适用功能：suite | fusion | swap | derive */
  scope?: string[]
  /** 是否默认启用 */
  defaultEnabled?: boolean
  /** 来源：built-in 兜底 / global 全局资产 / private 私有资产 */
  origin?: 'built-in' | 'global' | 'private'
  /** 用户改文（来自私有资产或本次编辑） */
  contentOverride?: string
}

export interface PersonaSnapshot {
  name: string
  dna: string
  hair_default?: string
  fingerprint?: string[]
}

export interface ThemeSnapshot {
  name: string
  /** 中文季节数组（春/夏/秋/冬）；空数组 = 全季 */
  season: string[]
  path: string
  points: string[]
}

export interface GarmentInfo {
  /** 服装主图 URL（可能为空，纯文生图时） */
  mainUrl?: string
  detailUrls?: string[]
  /** 特征速选（分组 → 名称数组） */
  features?: Record<string, string[]>
  /** 四层结构描述 */
  detail4?: { shape?: string; fabric?: string; structure?: string; element?: string }
  /** 印花描述 */
  printText?: string
  /** 自带配饰清单 */
  accessories?: string
}

export interface AssembleContext {
  persona?: PersonaSnapshot
  theme?: ThemeSnapshot
  /** 0..4；undefined = 单张模式（专家玩法） */
  pointIndex?: number
  garment: GarmentInfo
  model: string
  /** 功能场景：suite | fusion | swap | derive */
  feature: string
  /** 中文季节（春/夏/秋/冬），未选=undefined */
  season?: string
}

export interface LockSelection {
  key: string
  enabled: boolean
  /** 本次会话内的改文（优先级最高） */
  content?: string
}

export interface AssembleResult {
  /** 公共锁定部分全文（5 张共用） */
  commonText: string
  /** 每个点位的差异文本 */
  pointTexts: string[]
  /** 每张完整 Prompt = commonText + pointText */
  fullTexts: string[]
  /** 参与组装的条目（含启用状态，供预览 UI 回显） */
  usedEntries: Array<PromptEntry & { enabled: boolean }>
}

export const POINT_ORDER_BASE = 1000
