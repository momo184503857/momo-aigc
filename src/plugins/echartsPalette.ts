/**
 * ECharts 调色板 — 对齐 DDB UI 设计规范
 *
 * ECharts 的颜色在 JS 中消费，无法直接读 CSS 变量，故集中在此定义。
 * 颜色取值遵循 DDB 规范：
 *  - 分类系列色用 DDB 业务语义色 + 扩展强调色（禁用于主操作）
 *  - UI 中性灰对齐 Ant 中性色（axis/网格/tooltip 文字）
 */

/** ECharts 分类系列色（数据系列，按 DDB 业务语义 + 扩展强调色取值） */
export const CHART_COLORS = {
  /** 操作蓝 — 主系列（总任务/平台 Key） */
  blue: '#0088ff',
  /** 业务成功 — 完成系列 */
  green: '#31c19e',
  /** 危险 — 失败系列 */
  red: '#ff4d4f',
  /** 业务警告 — 消耗/金额系列 */
  orange: '#fa742b',
  /** 扩展强调-紫 — 辅助系列 */
  purple: '#722ed1',
  /** 扩展强调-青 — 辅助系列 */
  teal: '#00b0ff',
} as const

/** ECharts UI 中性色（axis/网格/tooltip/图例），对齐 DDB Ant 中性灰 */
export const CHART_NEUTRALS = {
  /** 一级文字（图例/tooltip 主体） */
  textPrimary: '#1d2129',
  /** 二级文字（图例/柱图标签） */
  textSecondary: '#4e5969',
  /** 辅助文字（axis 标签） */
  textTertiary: '#86909c',
  /** 网格分割线 */
  splitLine: '#f0f0f0',
  /** 坐标轴线 */
  axisLine: '#eef0f4',
  /** tooltip 边框 */
  tooltipBorder: '#eef0f4',
} as const

/** tooltip 基础配置，多处复用 */
export const tooltipBase = {
  trigger: 'axis' as const,
  backgroundColor: 'rgba(255,255,255,0.95)',
  borderColor: CHART_NEUTRALS.tooltipBorder,
  textStyle: { color: CHART_NEUTRALS.textPrimary, fontSize: 13 },
}

/** 将 hex 转为指定透明度的 rgba 字符串（用于 areaStyle 渐变 / 阴影） */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}
