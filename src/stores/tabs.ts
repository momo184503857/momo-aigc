import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Award,
  BookOpen,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  NotebookPen,
  PenLine,
  ScrollText,
  Sparkles,
  Users,
  Workflow,
} from '@lucide/vue'
import type { Component } from 'vue'

export interface TabItem {
  id: string
  path: string
  title: string
  icon: Component
  closable: boolean
  componentName: string
}

const STORAGE_KEY = 'momo_tabs'

// Route path -> { title, icon, componentName } mapping
// 图标与 SidebarMenu 保持同一套语义映射
const ROUTE_META_MAP: Record<string, { title: string; icon: Component; componentName: string }> = {
  '/free-gen': { title: '自由生图', icon: PenLine, componentName: 'FreeGen' },
  '/workspace': { title: '快速生图', icon: Sparkles, componentName: 'Workspace' },
  '/templates': { title: '模板图库', icon: LayoutTemplate, componentName: 'TemplatesPage' },
  '/results': { title: '生图结果', icon: ImageIcon, componentName: 'ResultsPage' },
  '/prompts': { title: '提示词库', icon: BookOpen, componentName: 'PromptLibraryPage' },
  '/prompt-workshop': { title: '提示词工坊', icon: NotebookPen, componentName: 'PromptWorkshopPage' },
  '/suite-prompt': { title: '成套提示词', icon: Layers, componentName: 'SuitePromptPage' },
  '/expert': { title: '提示词专家', icon: NotebookPen, componentName: 'ExpertPage' },
  '/admin/users': { title: '用户管理', icon: Users, componentName: 'AdminUsers' },
  '/admin/dashboard': { title: '生图日志', icon: ScrollText, componentName: 'AdminDashboard' },
  '/admin/templates': { title: '模板管理', icon: LayoutTemplate, componentName: 'AdminTemplates' },
  '/admin/feature-prompts': { title: '功能提示词', icon: PenLine, componentName: 'AdminFeaturePrompts' },
  '/admin/works': { title: '作品库管理', icon: Award, componentName: 'AdminWorks' },
  '/admin/prompt-cases': { title: '提示词案例', icon: ImageIcon, componentName: 'AdminPromptCases' },
  '/canvas-projects': { title: 'AI画布', icon: Workflow, componentName: 'CanvasProjects' },
  '/works': { title: '作品库', icon: Award, componentName: 'WorksGalleryPage' },
}

// Normalize path: strip trailing slash
function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

// Restore tabs from localStorage
function restoreTabs(): TabItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const paths: string[] = JSON.parse(raw)
    return paths
      .map((p) => {
        const meta = ROUTE_META_MAP[p]
        if (!meta) return null
        return {
          id: p,
          path: p,
          title: meta.title,
          icon: meta.icon,
          closable: true,
          componentName: meta.componentName,
        }
      })
      .filter(Boolean) as TabItem[]
  } catch {
    return []
  }
}

export const useTabStore = defineStore('tabs', () => {
  const router = useRouter()

  // Initialize with workspace tab, merge with saved tabs
  const savedTabs = restoreTabs()
  const hasWorkspace = savedTabs.some((t) => t.id === '/workspace')
  if (!hasWorkspace) {
    const meta = ROUTE_META_MAP['/workspace']
    savedTabs.unshift({
      id: '/workspace',
      path: '/workspace',
      title: meta.title,
      icon: meta.icon,
      closable: true,
      componentName: meta.componentName,
    })
  }

  const tabs = ref<TabItem[]>(savedTabs)
  const activeTabId = ref(normalizePath(router.currentRoute.value.path))

  // KeepAlive include list
  const keepAliveInclude = computed(() => tabs.value.map((t) => t.componentName))

  // Persist tabs to localStorage
  function persist() {
    const paths = tabs.value.map((t) => t.path)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paths))
  }

  // Add a tab (or just activate if already exists)
  function addTab(path: string) {
    const np = normalizePath(path)
    const existing = tabs.value.find((t) => t.id === np)
    if (existing) {
      activeTabId.value = np
      return
    }
    let meta = ROUTE_META_MAP[np]
    // Handle dynamic routes like /ai-canvas/:projectId
    if (!meta) {
      const aiCanvasMatch = np.match(/^\/ai-canvas\/\d+$/)
      if (aiCanvasMatch) {
        meta = { title: 'AI画布', icon: Workflow, componentName: 'AICanvas' }
      }
    }
    if (!meta) return
    tabs.value.push({
      id: np,
      path: np,
      title: meta.title,
      icon: meta.icon,
      closable: np !== '/workspace',
      componentName: meta.componentName,
    })
    activeTabId.value = np
    persist()
  }

  // Update tab title (for dynamic routes like AI canvas projects)
  function updateTabTitle(path: string, title: string) {
    const np = normalizePath(path)
    const tab = tabs.value.find((t) => t.id === np)
    if (tab) {
      tab.title = title
      persist()
    }
  }

  // Remove a tab
  function removeTab(id: string) {
    const idx = tabs.value.findIndex((t) => t.id === id)
    if (idx === -1) return

    tabs.value.splice(idx, 1)

    // If all tabs closed, auto-create workspace
    if (tabs.value.length === 0) {
      const meta = ROUTE_META_MAP['/workspace']
      tabs.value.push({
        id: '/workspace',
        path: '/workspace',
        title: meta.title,
        icon: meta.icon,
        closable: true,
        componentName: meta.componentName,
      })
      activeTabId.value = '/workspace'
      router.push('/workspace')
      persist()
      return
    }

    persist()

    // If removed tab was active, switch to neighbor
    if (activeTabId.value === id) {
      const newActive = tabs.value[Math.min(idx, tabs.value.length - 1)]
      if (newActive) {
        activeTabId.value = newActive.id
        router.push(newActive.path)
      }
    }
  }

  // Set active tab and navigate
  function setActiveTab(id: string) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    activeTabId.value = id
    router.push(tab.path)
  }

  // Close other tabs
  function removeOtherTabs(id: string) {
    tabs.value = tabs.value.filter((t) => t.id === id || !t.closable)
    persist()
    if (!tabs.value.some((t) => t.id === activeTabId.value)) {
      activeTabId.value = id
      const tab = tabs.value.find((t) => t.id === id)
      if (tab) router.push(tab.path)
    }
  }

  // Close all closable tabs
  function removeAllClosable() {
    tabs.value = []
    const meta = ROUTE_META_MAP['/workspace']
    tabs.value.push({
      id: '/workspace',
      path: '/workspace',
      title: meta.title,
      icon: meta.icon,
      closable: true,
      componentName: meta.componentName,
    })
    activeTabId.value = '/workspace'
    router.push('/workspace')
    persist()
  }

  // Sync activeTabId with route
  function syncFromRoute(path: string) {
    const np = normalizePath(path)
    activeTabId.value = np
    addTab(np)
  }

  return {
    tabs,
    activeTabId,
    keepAliveInclude,
    addTab,
    removeTab,
    setActiveTab,
    removeOtherTabs,
    removeAllClosable,
    syncFromRoute,
    updateTabTitle,
  }
})
