import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useAuthStore } from './auth'

export type PanelMode = 'collapsed' | 'side-by-side' | 'overlay'
export type TaskListView = 'new' | 'legacy'

const STORAGE_MODE = 'task_panel_mode'
const STORAGE_WIDTH = 'task_panel_width'
const STORAGE_LAST_EXPANDED_MODE = 'task_panel_last_expanded_mode'
const STORAGE_LIST_VIEW = 'task_panel_list_view'

type ExpandedMode = 'side-by-side' | 'overlay'

export const useTaskPanelStore = defineStore('taskPanel', () => {
  const auth = useAuthStore()
  const listView = ref<TaskListView>('new')
  watch(() => auth.user?.id, (userId) => {
    listView.value = userId && localStorage.getItem(`${STORAGE_LIST_VIEW}:${userId}`) === 'legacy' ? 'legacy' : 'new'
  }, { immediate: true })

  function setListView(view: TaskListView) {
    listView.value = view
    if (auth.user?.id) localStorage.setItem(`${STORAGE_LIST_VIEW}:${auth.user.id}`, view)
  }

  const panelMode = ref<PanelMode>(
    (localStorage.getItem(STORAGE_MODE) as PanelMode) || 'collapsed'
  )
  const panelWidth = ref(
    Math.max(360, Number(localStorage.getItem(STORAGE_WIDTH)) || 480)
  )

  const isCollapsed = computed(() => panelMode.value === 'collapsed')
  const isSideBySide = computed(() => panelMode.value === 'side-by-side')
  const isOverlay = computed(() => panelMode.value === 'overlay')

  const savedExpandedMode = localStorage.getItem(STORAGE_LAST_EXPANDED_MODE)
  let lastExpandedMode: ExpandedMode = panelMode.value === 'side-by-side' || panelMode.value === 'overlay'
    ? panelMode.value
    : savedExpandedMode === 'side-by-side' ? 'side-by-side' : 'overlay'

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
    lastExpandedMode = mode
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
    localStorage.setItem(STORAGE_LAST_EXPANDED_MODE, lastExpandedMode)
    localStorage.setItem(STORAGE_WIDTH, String(panelWidth.value))
  }

  return {
    panelMode,
    listView,
    panelWidth,
    isCollapsed,
    isSideBySide,
    isOverlay,
    togglePanel,
    setMode,
    setListView,
    setWidth,
    collapse,
  }
})
