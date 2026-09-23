<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Aperture,
  Award,
  BookOpen,
  Camera,
  ChevronsUpDown,
  Coins,
  FolderOpen,
  GraduationCap,
  Image as ImageIcon,
  LayoutTemplate,
  LogOut,
  NotebookPen,
  PenLine,
  Settings,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Wallet,
  Workflow,
  Wrench,
} from '@lucide/vue'
import type { Component } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTabStore } from '@/stores/tabs'
import { formatCredits } from '@/types/adapter'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
} from '@/components/ui/sidebar'

const auth = useAuthStore()
const tabStore = useTabStore()
const router = useRouter()
const route = useRoute()

// 头像显示平台积分余额（fixed-channels：渠道由平台统一配置，计费单轨积分；2 位小数向上取整）
const creditsLabel = computed(() => formatCredits(auth.user?.points ?? 0))
const roleLabel = computed(() => (auth.user?.role === 'admin' ? '管理员' : '普通用户'))
const avatarInitial = computed(() => auth.displayName.charAt(0).toUpperCase())

interface MenuItem {
  path: string
  title: string
  icon: Component
}

interface MenuSection {
  title: string
  items: MenuItem[]
}

// 图标语义全局唯一：同一业务含义在侧边栏、页签、页面内始终使用同一枚 Lucide 图标
const menuSections: MenuSection[] = [
  {
    title: 'AI生图',
    items: [
      { path: '/free-gen', title: '自由生图', icon: PenLine },
      { path: '/workspace', title: '快速生图', icon: Sparkles },
      { path: '/photography', title: 'AI摄影', icon: Camera },
      { path: '/canvas-projects', title: 'AI画布', icon: Workflow },
      { path: '/toolbox', title: 'AI工具箱', icon: Wrench },
      { path: '/buyer-show', title: 'AI买家秀', icon: ShoppingBag },
    ],
  },
  {
    title: 'AI学习',
    items: [
      { path: '/works', title: '作品库', icon: Award },
      { path: '/prompt-workshop', title: '提示词工坊', icon: NotebookPen },
      { path: '/expert', title: '提示词专家', icon: GraduationCap },
      { path: '/themes', title: '主题库', icon: FolderOpen },
    ],
  },
  {
    title: '资产管理',
    items: [
      { path: '/templates', title: '模板图库', icon: LayoutTemplate },
      { path: '/prompts', title: '提示词库', icon: BookOpen },
      { path: '/results', title: '生图结果', icon: ImageIcon },
    ],
  },
]

const accountMenuItems = [
  { title: '我的额度', icon: Coins, path: '/my-quota' },
  { title: '我的消耗', icon: TrendingUp, path: '/my-consumption' },
  { title: '计费说明', icon: Wallet, path: '/pricing' },
  { title: '个人设置', icon: Settings, path: '/settings' },
]

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

function navigate(path: string) {
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
        @click="router.push('/workspace')"
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
        <SidebarGroupLabel>{{ section.title }}</SidebarGroupLabel>
        <SidebarGroupContent>
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
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter v-if="auth.user">
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
