export const THEME_ACCENTS = [
  { value: 'orange', label: '橙色' },
  { value: 'blue', label: '蓝色' },
  { value: 'violet', label: '紫色' },
  { value: 'rose', label: '玫红' },
  { value: 'cyan', label: '青色' },
] as const

export type ThemeAccent = typeof THEME_ACCENTS[number]['value']

export const DEFAULT_THEME_ACCENT: ThemeAccent = 'orange'

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return typeof value === 'string' && THEME_ACCENTS.some(option => option.value === value)
}
