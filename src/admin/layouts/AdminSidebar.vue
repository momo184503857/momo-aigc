<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Award,
  Blocks,
  Camera,
  ChevronsUpDown,
  Coins,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  LogOut,
  PenLine,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from '@lucide/vue'
import type { Component } from 'vue'
import { useAuthStore } from '@/stores/auth'
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

const emit = defineEmits<{ (e: 'logout'): void; (e: 'back-to-user'): void }>()

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

interface MenuItem {
  path: string
  title: string
  icon: Component
}

// 图标与用户端 SidebarMenu / tabs store 共用同一套语义映射
const menuItems: MenuItem[] = [
  { path: '/admin/users', title: '用户管理', icon: Users },
  { path: '/admin/dashboard', title: '生图日志', icon: ScrollText },
  { path: '/admin/templates', title: '模板管理', icon: LayoutTemplate },
  { path: '/admin/feature-prompts', title: '功能提示词', icon: PenLine },
  { path: '/admin/photography', title: 'AI摄影配置', icon: Camera },
  { path: '/admin/works', title: '作品库管理', icon: Award },
  { path: '/admin/prompt-cases', title: '提示词案例', icon: ImageIcon },
  { path: '/admin/prompt-modules', title: '提示词模块', icon: Blocks },
  { path: '/admin/sg-assets', title: '成套生图资产', icon: Layers },
  { path: '/admin/ai-config', title: '配置', icon: Settings },
]

const creditsLabel = computed(() => formatCredits(auth.user?.points ?? 0))
const avatarInitial = computed(() => auth.displayName.charAt(0).toUpperCase())

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader class="border-b border-sidebar-border">
      <SidebarMenuButton size="lg" class="hover:bg-transparent active:bg-transparent">
        <span class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          <ShieldCheck class="size-4" />
        </span>
        <span class="grid flex-1 gap-0.5 text-left leading-none">
          <span class="text-sidebar-foreground truncate text-sm font-semibold">墨墨管理后台</span>
          <span class="text-muted-foreground truncate text-xs">运营与配置</span>
        </span>
      </SidebarMenuButton>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>管理</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in menuItems" :key="item.path">
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

    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton :tooltip="'返回用户端'" @click="emit('back-to-user')">
            <ArrowLeft />
            <span>返回用户端</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <template v-if="auth.user">
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
                <span class="text-muted-foreground truncate text-xs">管理员</span>
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
                  <span class="text-muted-foreground truncate text-xs">管理员</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="emit('back-to-user')">
              <ArrowLeft />
              返回用户端
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" @select="emit('logout')">
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
