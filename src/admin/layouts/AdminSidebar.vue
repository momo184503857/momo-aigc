<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronsUpDown, Coins, LogOut } from '@lucide/vue'
import { adminSections, canonicalAdminPath } from '@/configs/navigation'
import AppearanceSettings from '@/components/AppearanceSettings.vue'
import { DsBrandLogo } from '@/components/design-system'
import { useSidebar } from '@/components/design-system/primitives/sidebar/utils'
import { useAuthStore } from '@/stores/auth'
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

const emit = defineEmits<{ (e: 'logout'): void; (e: 'back-to-user'): void }>()

const auth = useAuthStore()
const route = useRoute()
const { setOpenMobile } = useSidebar()
const router = useRouter()

const menuSections = adminSections

const creditsLabel = computed(() => formatCredits(auth.user?.points ?? 0))
const avatarInitial = computed(() => auth.displayName.charAt(0).toUpperCase())

function isActive(path: string): boolean {
  return canonicalAdminPath(route.path) === path
}

function navigate(path: string) {
  setOpenMobile(false)
  router.push(path)
}
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader class="border-b border-sidebar-border">
      <SidebarMenuButton size="lg" class="hover:bg-transparent active:bg-transparent">
        <DsBrandLogo mark-only />
        <span class="grid flex-1 gap-0.5 text-left leading-none">
          <span class="text-sidebar-foreground truncate text-sm font-semibold">墨墨管理后台</span>
          <span class="text-muted-foreground truncate text-xs">运营与配置</span>
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

    <SidebarFooter>
      <AppearanceSettings />
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
