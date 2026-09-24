<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Aperture, ChevronsUpDown, Coins, FolderOpen, GraduationCap, LogOut } from '@lucide/vue'
import { creationModes, canvasItem, resultsItem, resourceItems, assistantItems, accountItems, isCreationPath } from '@/configs/navigation'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/design-system'
import { ChevronDown } from '@lucide/vue'
import AppearanceSettings from './AppearanceSettings.vue'
import { useSidebar } from '@/components/design-system/primitives/sidebar/utils'
import { useAuthStore } from '@/stores/auth'
import { useTabStore } from '@/stores/tabs'
import { formatCredits } from '@/types/adapter'
import { Avatar, AvatarFallback } from '@/components/design-system/primitives/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/design-system/primitives/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/design-system/primitives/sidebar'

const auth = useAuthStore()
const tabStore = useTabStore()
const router = useRouter()
const route = useRoute()
const { setOpenMobile } = useSidebar()

// 头像显示平台积分余额（fixed-channels：渠道由平台统一配置，计费单轨积分；2 位小数向上取整）
const creditsLabel = computed(() => formatCredits(auth.user?.points ?? 0))
const roleLabel = computed(() => (auth.user?.role === 'admin' ? '管理员' : '普通用户'))
const avatarInitial = computed(() => auth.displayName.charAt(0).toUpperCase())

const expandedGroups = ref<Record<string, boolean>>({资源中心:true,提示词助手:true})
const menuSections = [
 {title:'工作空间',items:[{...creationModes[0],title:'创作工作台'},canvasItem,resultsItem]},
 {title:'资源中心',items:resourceItems}, {title:'提示词助手',items:assistantItems},
]
const accountMenuItems = accountItems
function isActive(path: string): boolean {
  if (path === '/free-gen') return isCreationPath(route.path)
  if (path === '/canvas-projects' && route.path.startsWith('/ai-canvas/')) return true
  return route.path === path || route.path.startsWith(path + '/')
}

function navigate(path: string) {
  setOpenMobile(false)
  tabStore.syncFromRoute(path)
  router.push(path)
}

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader class="border-b border-sidebar-border">
      <SidebarMenuButton
        size="lg"
        class="hover:bg-transparent active:bg-transparent"
        @click="router.push('/free-gen')"
      >
        <span class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Aperture class="size-4" />
        </span>
        <span class="grid flex-1 gap-0.5 text-left leading-none">
          <span class="text-sidebar-foreground truncate text-sm font-semibold">墨墨 AI 生图</span>
          <span class="text-muted-foreground truncate text-xs">图像生成工作台</span>
        </span>
      </SidebarMenuButton>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup v-for="section in menuSections" :key="section.title">
        <Collapsible :open="section.title === '工作空间' || expandedGroups[section.title]" @update:open="expandedGroups[section.title] = $event">
        <SidebarGroupLabel v-if="section.title === '工作空间'">{{ section.title }}</SidebarGroupLabel>
        <CollapsibleTrigger v-else as-child><SidebarMenuButton :tooltip="section.title"><FolderOpen v-if="section.title === '资源中心'" /><GraduationCap v-else /><span>{{ section.title }}</span><ChevronDown class="ml-auto size-4" /></SidebarMenuButton></CollapsibleTrigger>
        <CollapsibleContent><SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in section.items" :key="item.path">
              <SidebarMenuButton
                :is-active="isActive(item.path)"
                :tooltip="item.title"
                class="data-active:bg-accent data-active:text-accent-foreground"
                @click="navigate(item.path)"
              >
                <component :is="item.icon" />
                <span>{{ item.title }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent></CollapsibleContent></Collapsible>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter v-if="auth.user">
      <AppearanceSettings />
      <div class="text-muted-foreground flex items-center gap-1.5 px-2 pb-1 text-xs group-data-[collapsible=icon]:hidden">
        <Coins class="size-3.5 shrink-0 text-warning" />
        <span>可用积分</span>
        <span class="text-foreground ml-auto font-medium tabular-nums">{{ creditsLabel }}</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton size="lg" class="data-open:bg-sidebar-accent">
            <Avatar class="size-8 rounded-lg">
              <AvatarFallback class="bg-primary text-primary-foreground rounded-lg text-xs font-semibold">
                {{ avatarInitial }}
              </AvatarFallback>
            </Avatar>
            <span class="grid flex-1 gap-0.5 text-left leading-tight">
              <span class="text-sidebar-foreground truncate text-sm font-medium">{{ auth.displayName }}</span>
              <span class="text-muted-foreground truncate text-xs">{{ roleLabel }}</span>
            </span>
            <ChevronsUpDown class="text-muted-foreground ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-56 rounded-lg" side="top" align="start" :side-offset="8">
          <DropdownMenuLabel class="p-0 font-normal">
            <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar class="size-8 rounded-lg">
                <AvatarFallback class="bg-primary text-primary-foreground rounded-lg text-xs font-semibold">
                  {{ avatarInitial }}
                </AvatarFallback>
              </Avatar>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">{{ auth.displayName }}</span>
                <span class="text-muted-foreground truncate text-xs">{{ roleLabel }}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-for="item in accountMenuItems" :key="item.path" @select="router.push(item.path)">
            <component :is="item.icon" />
            {{ item.title }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-if="auth.isAdmin" @select="router.push('/admin/users')">管理后台</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" @select="handleLogout">
            <LogOut />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
