/**
 * 原版拆解（18 项）字段规格 —— 表单渲染、Prompt 组装、推理补全共用的唯一字段定义。
 * 改动字段时需同步：知识库 field_options / reason_rule 种子（server/src/db/data/suiteGenSeed.json）。
 */

export interface DecomposeField {
  key: string
  label: string
  kind: 'select' | 'text'
}

/** 18 项：16 项知识库下拉 + 2 项自由文本 */
export const DECOMPOSE_FIELDS: DecomposeField[] = [
  { key: 'theme', label: '核心主题&风格定位', kind: 'select' },
  { key: 'scene', label: '场景背景', kind: 'select' },
  { key: 'props', label: '道具', kind: 'select' },
  { key: 'space', label: '空间结构', kind: 'select' },
  { key: 'face', label: '模特面部', kind: 'select' },
  { key: 'expression', label: '表情神态', kind: 'select' },
  { key: 'makeup', label: '完整妆发体系', kind: 'select' },
  { key: 'pose', label: '全身姿态', kind: 'select' },
  { key: 'body', label: '肢体动作逻辑', kind: 'select' },
  { key: 'accessories', label: '全套穿戴配饰发饰', kind: 'select' },
  { key: 'light', label: '光影系统', kind: 'select' },
  { key: 'camera', label: '摄影机位', kind: 'select' },
  { key: 'lens', label: '镜头', kind: 'select' },
  { key: 'composition', label: '构图规范', kind: 'select' },
  { key: 'quality', label: '画质', kind: 'select' },
  { key: 'params', label: '成像参数', kind: 'select' },
  { key: 'garment', label: '服装描述', kind: 'text' },
  { key: 'atmosphere', label: '氛围', kind: 'text' },
]

export const DECOMPOSE_KEYS: string[] = DECOMPOSE_FIELDS.map((f) => f.key)

export const DECOMPOSE_LABELS: Record<string, string> = Object.fromEntries(
  DECOMPOSE_FIELDS.map((f) => [f.key, f.label]),
)

/** 已填字段 → 【标签】值 行数组（空值跳过） */
export function filledSections(values: Record<string, string>): string[] {
  return DECOMPOSE_FIELDS
    .filter((f) => (values[f.key] || '').trim())
    .map((f) => `【${f.label}】${values[f.key].trim()}`)
}
