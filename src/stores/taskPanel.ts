import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type PanelMode = 'collapsed' | 'side-by-side' | 'overlay'

const STORAGE_MODE = 'task_panel_mode'
const STORAGE_WIDTH = 'task_panel_width'

export const useTaskPanelStore = defineStore('taskPanel', () => {
  const panelMode = ref<PanelMode>(
    (localStorage.getItem(STORAGE_MODE) as PanelMode) || 'collapsed'
  )
  const panelWidth = ref(
    Math.max(360, Number(localStorage.getItem(STORAGE_WIDTH)) || 480)
  )

  const isCollapsed = computed(() => panelMode.value === 'collapsed')
  const isSideBySide = computed(() => panelMode.value === 'side-by-side')
  const isOverlay = computed(() => panelMode.value === 'overlay')

  let lastExpandedMode: 'side-by-side' | 'overlay' = 'side-by-side'

  function togglePanel() {
    if (panelMode.value === 'collapsed') {
      panelMode.value = lastExpandedMode
    } else {
      lastExpandedMode = panelMode.value as 'side-by-side' | 'overlay'
      panelMode.value = 'collapsed'
    }
    persist()
  }

  function setMode(mode: 'side-by-side' | 'overlay') {
    panelMode.value = mode
    persist()
  }

  function setWidth(w: number) {
    panelWidth.value = Math.max(360, w)
    persist()
  }

  function collapse() {
    if (panelMode.value !== 'collapsed') {
      lastExpandedMode = panelMode.value as 'side-by-side' | 'overlay'
    }
    panelMode.value = 'collapsed'
    persist()
  }

  function persist() {
    localStorage.setItem(STORAGE_MODE, panelMode.value)
    localStorage.setItem(STORAGE_WIDTH, String(panelWidth.value))
  }

  return {
    panelMode,
    panelWidth,
    isCollapsed,
    isSideBySide,
    isOverlay,
    togglePanel,
    setMode,
    setWidth,
    collapse,
  }
})
