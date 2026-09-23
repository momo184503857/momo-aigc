<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { List, LoaderCircle } from '@lucide/vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { useTabStore } from '@/stores/tabs'
import { useTaskManager } from '@/composables/useTaskManager'
import AppHeader, { type Crumb } from '@/components/AppHeader.vue'
import SidebarMenu from '@/components/SidebarMenu.vue'
import TaskPanel from '@/components/TaskPanel.vue'
import TabBar from '@/components/TabBar.vue'
import HelpButton from '@/components/help/HelpButton.vue'
import HelpDrawer from '@/components/help/HelpDrawer.vue'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

const serverStatus = useServerStatusStore()
const taskPanel = useTaskPanelStore()
const tabStore = useTabStore()
const tm = useTaskManager()
const route = useRoute()

// Sync tabs with route changes
watch(() => route.path, (path) => {
  tabStore.syncFromRoute(path)
}, { immediate: true })

const contentStyle = computed(() => {
  if (taskPanel.isSideBySide) {
    return { marginRight: taskPanel.panelWidth + 'px' }
  }
  return {}
})

// 详情页/子页回退到所属一级页；一级页面自身标题由 PageLayout 的 H2 承担，
// 顶栏不再重复一次同名面包屑。
function resolveParentCrumb(path: string): Crumb | null {
  if (path.startsWith('/works/')) return { title: '作品库', to: '/works' }
  if (path.startsWith('/ai-canvas/')) return { title: 'AI画布', to: '/canvas-projects' }
  if (path.startsWith('/toolbox/')) return { title: 'AI工具箱', to: '/toolbox' }
  return null
}

const crumbs = computed<Crumb[]>(() => {
  const parent = resolveParentCrumb(route.path)
  return parent ? [parent] : []
})

// 任务面板开关收进全局顶栏：浮标会压住每个页面右下角的吸底动作栏，
// 而任务面板本身是全局状态，控制器放在全局栏更符合归属。
function toggleTaskPanel() {
  if (taskPanel.isCollapsed) taskPanel.togglePanel()
  else taskPanel.collapse()
}

onMounted(() => {
  serverStatus.fetchStatus()
})
</script>

<template>
  <SidebarProvider class="h-svh overflow-hidden">
    <SidebarMenu />

    <SidebarInset :style="contentStyle" class="h-svh overflow-hidden">
      <AppHeader :crumbs="crumbs">
        <template #actions>
          <Button
            variant="ghost"
            size="sm"
            class="gap-1.5"
            :aria-label="taskPanel.isCollapsed ? '打开任务面板' : '收起任务面板'"
            @click="toggleTaskPanel"
          >
            <LoaderCircle v-if="tm.hasActiveJobs.value" class="size-4 animate-spin" />
            <List v-else class="size-4" />
            <span v-if="tm.activeTaskCount.value > 0" class="text-xs tabular-nums">
              {{ tm.activeTaskCount.value > 99 ? '99+' : tm.activeTaskCount.value }}
            </span>
          </Button>
          <HelpButton />
        </template>
      </AppHeader>

      <TabBar />

      <!-- 滚动与内边距全部交给页面外壳 PageLayout（.page-content 是唯一滚动容器），
           页面才能做全出血布局与吸底动作栏 -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <router-view v-slot="{ Component }">
          <KeepAlive :include="tabStore.keepAliveInclude">
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </div>
    </SidebarInset>

    <!-- Task Panel (global) -->
    <TaskPanel />

    <!-- Help Drawer (global, user-facing pages only) -->
    <HelpDrawer />
  </SidebarProvider>
</template>
