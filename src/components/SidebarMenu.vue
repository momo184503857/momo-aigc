<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Aperture, Settings, LogOut, List, LoaderCircle, CircleHelp } from '@lucide/vue'
import { creationModes, canvasItem, assetItem, accountItems, isCreationPath, isAssetPath } from '@/configs/navigation'
import { DsNavigationDock, Button } from '@/components/design-system'
import { Sidebar } from '@/components/design-system/primitives/sidebar'
import { useTaskPanelStore } from '@/stores/taskPanel'
import { useTaskManager } from '@/composables/useTaskManager'
import { useHelp } from '@/composables/useHelp'
import { useAuthStore } from '@/stores/auth'
import { formatCredits } from '@/types/adapter'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/design-system/primitives/dropdown-menu'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const taskPanel = useTaskPanelStore()
const tm = useTaskManager()
const { open: openHelp, available: helpAvailable } = useHelp()
const creditsLabel = computed(() => formatCredits(auth.user?.points ?? 0))
const creditsValue = computed(() => creditsLabel.value.replace(/\s*积分$/, ''))
const menuItems = computed(() => [
  { ...creationModes[0], title: '创作工作台' }, canvasItem, assetItem,
].map(item => ({ ...item, active: item.path === '/free-gen' ? isCreationPath(route.path)
  : item.path === '/canvas-projects' ? route.path === item.path || route.path.startsWith('/ai-canvas/')
  : item.path === '/assets' ? isAssetPath(route.path)
  : route.path === item.path || route.path.startsWith(item.path + '/') })))
function navigate(path: string) { router.push(path) }
function handleLogout() { auth.logout(); router.push('/login') }
</script>

<template>
  <Sidebar variant="dock" collapsible="none">
    <div class="ds-dock-brand">
      <Button size="icon-lg" aria-label="墨墨 AI 生图，返回创作工作台" @click="navigate('/free-gen')"><Aperture /></Button>
    </div>
    <div class="ds-dock-content">
      <DsNavigationDock :items="menuItems" @navigate="navigate" />
    </div>
    <div v-if="auth.user" class="ds-dock-account">
      <Button variant="ghost" size="icon" :aria-label="taskPanel.isCollapsed ? '打开任务面板' : '收起任务面板'" :title="taskPanel.isCollapsed ? '打开任务面板' : '收起任务面板'" @click="taskPanel.isCollapsed ? taskPanel.togglePanel() : taskPanel.collapse()">
        <LoaderCircle v-if="tm.hasActiveJobs.value" class="size-4 animate-spin" /><List v-else />
        <span v-if="tm.activeTaskCount.value" class="text-xs tabular-nums">{{ tm.activeTaskCount.value > 99 ? '99+' : tm.activeTaskCount.value }}</span>
      </Button>
      <div class="ds-dock-credits" :aria-label="`剩余积分 ${creditsLabel}`">
        <span>剩余积分</span><strong>{{ creditsValue }}</strong>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger as-child><Button variant="ghost" size="icon" aria-label="设置" title="设置"><Settings /></Button></DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" :side-offset="12">
          <DropdownMenuLabel>{{ auth.displayName }}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-for="item in accountItems" :key="item.path" @select="navigate(item.path)"><component :is="item.icon" />{{ item.title }}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="!helpAvailable" :title="helpAvailable ? '使用帮助' : '该页面暂未提供帮助文档'" @select="openHelp"><CircleHelp />使用帮助</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" @select="handleLogout"><LogOut />退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </Sidebar>
</template>
