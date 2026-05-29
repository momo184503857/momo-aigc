<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useTabStore } from '@/stores/tabs'
import { Close } from '@element-plus/icons-vue'

const tabStore = useTabStore()

// Context menu
const contextMenu = ref({ visible: false, x: 0, y: 0, tabId: '' })

function onContextMenu(e: MouseEvent, tabId: string) {
  e.preventDefault()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, tabId }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function ctxClose() {
  tabStore.removeTab(contextMenu.value.tabId)
  closeContextMenu()
}

function ctxCloseOthers() {
  tabStore.removeOtherTabs(contextMenu.value.tabId)
  closeContextMenu()
}

function ctxCloseAll() {
  tabStore.removeAllClosable()
  closeContextMenu()
}

// Click outside to close context menu
function onDocClick() {
  closeContextMenu()
}

// Scroll tabs into view on click
function onTabClick(tabId: string) {
  tabStore.setActiveTab(tabId)
  nextTick(() => {
    const el = document.querySelector(`.tab-item[data-id="${tabId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  })
}

const activeTab = computed(() => tabStore.activeTabId)
</script>

<template>
  <div class="tab-bar" @click="onDocClick">
    <div class="tab-list">
      <div
        v-for="tab in tabStore.tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: tab.id === activeTab }"
        :data-id="tab.id"
        @click.stop="onTabClick(tab.id)"
        @contextmenu.stop="onContextMenu($event, tab.id)"
      >
        <el-icon class="tab-icon"><component :is="tab.icon" /></el-icon>
        <span class="tab-title">{{ tab.title }}</span>
        <span
          v-if="tab.closable"
          class="tab-close"
          @click.stop="tabStore.removeTab(tab.id)"
        >
          <el-icon :size="12"><Close /></el-icon>
        </span>
      </div>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="tab-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="ctx-item" @click="ctxClose">关闭</div>
        <div class="ctx-item" @click="ctxCloseOthers">关闭其他</div>
        <div class="ctx-item" @click="ctxCloseAll">关闭所有</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tab-bar {
  height: 36px;
  background: var(--momo-color-bg);
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
  overflow: hidden;
}

.tab-list {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 8px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  flex: 1;
}

.tab-list::-webkit-scrollbar {
  display: none;
}

.tab-item {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 6px 6px 0 0;
  background: var(--momo-color-bg-muted);
  color: var(--momo-color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  max-width: 160px;
  min-width: 0;
  transition: background 0.15s, color 0.15s;
  position: relative;
}

.tab-item:hover {
  background: var(--el-fill-color-light);
  color: var(--momo-color-text);
}

.tab-item.active {
  background: var(--momo-color-bg);
  color: var(--el-color-primary);
  font-weight: 500;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--el-color-primary);
}

.tab-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}

.tab-item:hover .tab-close {
  opacity: 0.6;
}

.tab-close:hover {
  opacity: 1 !important;
  background: var(--el-fill-color);
}

/* Context menu */
.tab-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--momo-radius-md);
  box-shadow: var(--el-box-shadow-light);
  padding: 4px 0;
  min-width: 120px;
}

.ctx-item {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: background 0.15s;
}

.ctx-item:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
</style>
