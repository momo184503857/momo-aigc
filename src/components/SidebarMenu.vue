<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Settings, LogOut, CircleHelp } from '@lucide/vue'
import { creationModes, assetTabs, canvasItem, assetItem, accountItems, isCreationPath, isAssetPath } from '@/configs/navigation'
import { DsBrandLogo, DsNavigationDock, Button } from '@/components/design-system'
import { Sidebar } from '@/components/design-system/primitives/sidebar'
import TaskDockEntry from './TaskDockEntry.vue'
import { useHelp } from '@/composables/useHelp'
import { useAuthStore } from '@/stores/auth'
import { formatCredits } from '@/types/adapter'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/design-system/primitives/dropdown-menu'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { open: openHelp, available: helpAvailable } = useHelp()
const creditsLabel = computed(() => formatCredits(auth.user?.points ?? 0))
const creditsValue = computed(() => creditsLabel.value.replace(/\s*积分$/, ''))
const menuItems = computed(() => [
  {
    ...creationModes[0], title: '创作工作台', active: isCreationPath(route.path),
    children: creationModes.map(item => ({ ...item, active: route.path === item.path || route.path.startsWith(item.path + '/') })),
  },
  { ...canvasItem, active: route.path === canvasItem.path || route.path.startsWith('/ai-canvas/') },
  {
    ...assetItem, path: assetTabs[0]!.path, active: isAssetPath(route.path),
    children: assetTabs.map(item => ({ ...item, active: route.path === item.path || route.path === item.legacyPath })),
  },
])
function navigate(path: string) { router.push(path) }
function handleLogout() { auth.logout(); router.push('/login') }
</script>

<template>
  <Sidebar variant="dock" collapsible="none">
    <div class="ds-dock-brand">
      <Button variant="ghost" class="ds-brand-button" aria-label="墨墨，返回创作工作台" @click="navigate('/workspace')"><DsBrandLogo /></Button>
    </div>
    <div class="ds-dock-content">
      <div class="ds-dock-stack">
        <DsNavigationDock :items="menuItems" @navigate="navigate" />
        <TaskDockEntry v-if="auth.user" />
      </div>
    </div>
    <div v-if="auth.user" class="ds-dock-account">
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
