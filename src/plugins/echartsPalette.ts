/** 图表消费公共主题；读取外观状态以在主题切换时重算 computed 图表配置。 */
import { useAppearanceStore } from '@/stores/appearance'
export function chartColor(token: string): string {
  const appearance = useAppearanceStore()
  void appearance.mode
  // A temporary theme probe avoids reading a stale DOM attribute before Vue's render flush.
  const probe = document.createElement('span')
  probe.className = 'ds-theme'
  probe.dataset.theme = appearance.mode
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const value = getComputedStyle(probe).getPropertyValue(token).trim()
  probe.remove()
  return value
}
export const CHART_COLORS = {
  get blue() { return chartColor('--ds-chart-blue') },
  get green() { return chartColor('--ds-chart-green') },
  get red() { return chartColor('--ds-chart-red') },
  get orange() { return chartColor('--ds-chart-orange') },
  get purple() { return chartColor('--ds-chart-purple') },
  get teal() { return chartColor('--ds-chart-teal') },
}
export const CHART_NEUTRALS = {
  get textPrimary() { return chartColor('--foreground') },
  get textSecondary() { return chartColor('--muted-foreground') },
  get textTertiary() { return chartColor('--muted-foreground') },
  get splitLine() { return chartColor('--border') },
  get axisLine() { return chartColor('--border') },
  get tooltipBorder() { return chartColor('--border') },
  get surface() { return chartColor('--card') },
  get shadow() { return chartColor('--ds-overlay-soft') },
}
export const tooltipBase = {
  trigger: 'axis' as const,
  get backgroundColor() { return CHART_NEUTRALS.surface },
  get borderColor() { return CHART_NEUTRALS.tooltipBorder },
  get textStyle() { return { color: CHART_NEUTRALS.textPrimary, fontSize: 14 } },
}
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  if (color.startsWith('#')) return `${color}${Math.round(a * 255).toString(16).padStart(2, '0')}`
  return color.replace(/^rgb\((.*)\)$/, `rgba($1, ${a})`)
}
