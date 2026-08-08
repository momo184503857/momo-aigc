<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { useTabStore } from '@/stores/tabs'
import { useTaskManager } from '@/composables/useTaskManager'
import { Fold, Expand, Loading, List } from '@element-plus/icons-vue'
import SidebarMenu from '@/components/SidebarMenu.vue'
import TaskPanel from '@/components/TaskPanel.vue'
import TabBar from '@/components/TabBar.vue'

const serverStatus = useServerStatusStore()
const taskPanel = useTaskPanelStore()
const tabStore = useTabStore()
const tm = useTaskManager()
const route = useRoute()

// Sync tabs with route changes
watch(() => route.path, (path) => {
  tabStore.syncFromRoute(path)
}, { immediate: true })

const sidebarCollapsed = ref(false)

const pageTitle = computed(() => route.meta.title as string || '')

const contentStyle = computed(() => {
  if (taskPanel.isSideBySide) {
    return { marginRight: taskPanel.panelWidth + 'px' }
  }
  return {}
})

// ─── FAB drag ───
const fabTop = ref<number | null>(null)
const fabLeft = ref<number | null>(null)
const fabBottom = ref(32)
const isDraggingFab = ref(false)
const isSnappingBack = ref(false)
let dragStartX = 0
let dragStartY = 0
let dragStartLeft = 0
let dragStartTop = 0
let hasMoved = false

const FAB_RIGHT = 32
const FAB_WIDTH = 120

function getRestingStyle(): Record<string, string> {
  if (fabTop.value !== null) {
    return { top: fabTop.value + 'px', right: FAB_RIGHT + 'px' }
  }
  return { bottom: fabBottom.value + 'px', right: FAB_RIGHT + 'px' }
}

function getDraggingStyle(): Record<string, string> {
  if (fabLeft.value !== null && fabTop.value !== null) {
    return { top: fabTop.value + 'px', left: fabLeft.value + 'px' }
  }
  return getRestingStyle()
}

const fabStyle = computed(() => {
  if (isDraggingFab.value) return getDraggingStyle()
  if (isSnappingBack.value && fabTop.value !== null) {
    return { top: fabTop.value + 'px', right: FAB_RIGHT + 'px' }
  }
  return getRestingStyle()
})

function onFabMouseDown(e: MouseEvent) {
  startDrag(e.clientX, e.clientY)
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function onFabTouchStart(e: TouchEvent) {
  startDrag(e.touches[0].clientX, e.touches[0].clientY)
}

function startDrag(clientX: number, clientY: number) {
  isDraggingFab.value = true
  isSnappingBack.value = false
  hasMoved = false

  // Calculate current position
  const rect = (document.querySelector('.task-fab') as HTMLElement)?.getBoundingClientRect()
  if (rect) {
    dragStartLeft = rect.left
    dragStartTop = rect.top
  }
  fabLeft.value = dragStartLeft
  fabTop.value = dragStartTop

  dragStartX = clientX
  dragStartY = clientY
}

function onFabPointerMove(e: MouseEvent | TouchEvent) {
  if (!isDraggingFab.value) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  const dx = clientX - dragStartX
  const dy = clientY - dragStartY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true

  const newLeft = dragStartLeft + dx
  const newTop = dragStartTop + dy
  fabLeft.value = Math.max(0, Math.min(window.innerWidth - FAB_WIDTH, newLeft))
  fabTop.value = Math.max(0, Math.min(window.innerHeight - 44, newTop))
}

function onFabPointerUp() {
  if (!isDraggingFab.value) return
  isDraggingFab.value = false
  document.body.style.userSelect = ''

  // Snap back to right side
  isSnappingBack.value = true
  // Save vertical position
  if (fabTop.value !== null) {
    localStorage.setItem('fab_top', String(fabTop.value))
  }
  // After transition ends, switch back to right positioning
  setTimeout(() => {
    isSnappingBack.value = false
    fabLeft.value = null
  }, 300)
}

function onFabClick() {
  if (hasMoved) return
  taskPanel.togglePanel()
}

onMounted(() => {
  serverStatus.fetchStatus()
  const saved = localStorage.getItem('fab_top')
  if (saved) {
    fabTop.value = Math.max(0, Math.min(window.innerHeight - 44, Number(saved)))
  }

  document.addEventListener('mousemove', onFabPointerMove)
  document.addEventListener('mouseup', onFabPointerUp)
  document.addEventListener('touchmove', onFabPointerMove)
  document.addEventListener('touchend', onFabPointerUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onFabPointerMove)
  document.removeEventListener('mouseup', onFabPointerUp)
  document.removeEventListener('touchmove', onFabPointerMove)
  document.removeEventListener('touchend', onFabPointerUp)
})
</script>

<template>
  <div class="main-layout">
    <SidebarMenu :collapsed="sidebarCollapsed" />
    <div class="main-content" :style="contentStyle">
      <div class="main-header">
        <div class="header-left">
          <el-button
            size="small"
            :icon="sidebarCollapsed ? Expand : Fold"
            @click="sidebarCollapsed = !sidebarCollapsed"
          />
          <span class="page-title">{{ pageTitle }}</span>
        </div>
      </div>
      <TabBar />
      <div class="main-body">
        <router-view v-slot="{ Component }">
          <KeepAlive :include="tabStore.keepAliveInclude">
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </div>
    </div>

    <!-- Task Panel (global) -->
    <TaskPanel />

    <!-- FAB button (collapsed state) -->
    <div
      v-if="taskPanel.isCollapsed"
      class="task-fab"
      :class="{ 'has-active': tm.hasActiveJobs.value, dragging: isDraggingFab, snapping: isSnappingBack }"
      :style="fabStyle"
      @click="onFabClick"
      @mousedown="onFabMouseDown"
      @touchstart.prevent="onFabTouchStart"
    >
      <template v-if="tm.hasActiveJobs.value">
        <el-badge :value="tm.activeTaskCount.value" :max="99">
          <el-icon :size="20" class="fab-spin"><Loading /></el-icon>
        </el-badge>
        <span class="fab-label">生成中</span>
      </template>
      <template v-else>
        <el-icon :size="20"><List /></el-icon>
        <span class="fab-label">任务列表</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.main-layout {
  height: 100vh;
  display: flex;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.main-header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.header-left {
  display: flex; align-items: center; gap: 10px;
}

.page-title {
  font-size: var(--momo-font-size-2xl);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.main-body {
  flex: 1;
  padding: var(--momo-page-padding);
  overflow: auto;
}

/* FAB button */
.task-fab {
  position: fixed;
  z-index: 2001;
  height: 44px;
  padding: 0 16px;
  border-radius: 22px;
  background: var(--el-color-primary);
  color: var(--el-color-white);
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: grab;
  box-shadow: var(--el-box-shadow);
  user-select: none;
  -webkit-user-select: none;
}

.task-fab.snapping {
  transition: top 0.3s cubic-bezier(0.25, 0.1, 0.25, 1),
              left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.task-fab:hover {
  box-shadow: var(--el-box-shadow-dark);
}

.task-fab.dragging {
  cursor: grabbing;
  box-shadow: var(--el-box-shadow-dark);
}

.task-fab.has-active {
  background: var(--el-color-warning);
  animation: fab-pulse 2s ease-in-out infinite;
}

@keyframes fab-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--el-color-warning-rgb, 230, 162, 60), 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(var(--el-color-warning-rgb, 230, 162, 60), 0); }
}

.fab-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.fab-spin {
  animation: fab-rotate 1.2s linear infinite;
}

@keyframes fab-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
