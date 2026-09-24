<script setup lang="ts">
import { useMediaQuery, useWindowSize } from '@vueuse/core'
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskPanelStore } from '@/stores/taskPanel'
import CreationModeNav from '@/components/CreationModeNav.vue'
import SidebarMenu from '@/components/SidebarMenu.vue'
import TaskPanel from '@/components/TaskPanel.vue'
import HelpDrawer from '@/components/help/HelpDrawer.vue'
import { SidebarInset, SidebarProvider } from '@/components/design-system/primitives/sidebar'

const serverStatus = useServerStatusStore()
const taskPanel = useTaskPanelStore()
const route = useRoute()

const narrowScreen = useMediaQuery('(max-width: 1023px)')
const { width: viewportWidth } = useWindowSize()
const contentStyle = computed(() => {
  if (taskPanel.isSideBySide && !narrowScreen.value) {
    return { marginRight: Math.min(taskPanel.panelWidth, viewportWidth.value - 320) + 'px' }
  }
  return {}
})

onMounted(() => {
  serverStatus.fetchStatus()
})
</script>

<template>
  <SidebarProvider class="ds-dock-layout h-svh overflow-hidden">
    <SidebarMenu />

    <SidebarInset :style="contentStyle" class="h-svh overflow-hidden">
      <CreationModeNav />

      <!-- 滚动与内边距全部交给页面外壳 PageLayout（.page-content 是唯一滚动容器），
           页面才能做全出血布局与吸底动作栏 -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <router-view v-slot="{ Component }">
          <!-- 页面草稿缓存独立于已移除的页签系统，限制最多缓存 12 个页面。 -->
          <KeepAlive :max="12">
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
