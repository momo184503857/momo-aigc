import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ThemeMode } from '@/components/design-system'
const KEY = 'momo_ui_appearance_v1'
type Density = 'comfortable' | 'compact'
function read() {
 try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
export const useAppearanceStore = defineStore('appearance', () => {
 const saved = read()
 const mode = ref<ThemeMode>(saved.mode === 'dark' ? 'dark' : 'light')
 const density = ref<Density>(saved.density === 'compact' ? 'compact' : 'comfortable')
 watch([mode,density], () => { try { localStorage.setItem(KEY, JSON.stringify({mode:mode.value,density:density.value})) } catch { /* 私密模式下仍可使用当前设置 */ } })
 window.addEventListener('storage', event => {
  if (event.key !== KEY) return
  const value = read()
  mode.value = value.mode === 'dark' ? 'dark' : 'light'
  density.value = value.density === 'compact' ? 'compact' : 'comfortable'
 })
 return { mode, density }
})
