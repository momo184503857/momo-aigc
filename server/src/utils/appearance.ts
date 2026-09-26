export const THEME_COLORS = ['orange', 'blue', 'violet', 'rose', 'cyan'] as const
export type ThemeColor = typeof THEME_COLORS[number]
export const DEFAULT_THEME_COLOR: ThemeColor = 'orange'

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && THEME_COLORS.includes(value as ThemeColor)
}

export function normalizeThemeColor(value: unknown): ThemeColor {
  return isThemeColor(value) ? value : DEFAULT_THEME_COLOR
}
