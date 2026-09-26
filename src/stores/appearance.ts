import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ThemeMode } from '@/components/design-system'
import { DEFAULT_THEME_ACCENT, isThemeAccent, type ThemeAccent } from '@/types/appearance'
const KEY = 'momo_ui_appearance_v1'
type Density = 'comfortable' | 'compact'
function read() {
 try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
export const useAppearanceStore = defineStore('appearance', () => {
 const saved = read()
 const mode = ref<ThemeMode>(saved.mode === 'dark' ? 'dark' : 'light')
 const density = ref<Density>(saved.density === 'compact' ? 'compact' : 'comfortable')
 const accent = ref<ThemeAccent>(isThemeAccent(saved.accent) ? saved.accent : DEFAULT_THEME_ACCENT)
 const accentSaving = ref(false)
 function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ mode: mode.value, density: density.value, accent: accent.value })) } catch { /* 私密模式下仍可使用当前设置 */ }
 }
 watch([mode, density], persist)
 function previewAccent(value: ThemeAccent) { accent.value = value }
 function commitAccent(value: ThemeAccent) { accent.value = value; persist() }
 function hydrateAccent(value: unknown) { commitAccent(isThemeAccent(value) ? value : DEFAULT_THEME_ACCENT) }
 function resetAccent() { commitAccent(DEFAULT_THEME_ACCENT) }
 window.addEventListener('storage', event => {
  if (event.key !== KEY) return
  const value = read()
  mode.value = value.mode === 'dark' ? 'dark' : 'light'
  density.value = value.density === 'compact' ? 'compact' : 'comfortable'
  accent.value = isThemeAccent(value.accent) ? value.accent : DEFAULT_THEME_ACCENT
 })
 return { mode, density, accent, accentSaving, previewAccent, commitAccent, hydrateAccent, resetAccent }
})
