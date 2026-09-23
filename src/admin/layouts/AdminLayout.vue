<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import AppHeader from '@/components/AppHeader.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import AdminSidebar from './AdminSidebar.vue'

useModelCatalogStore().ensureLoaded()

const router = useRouter()
const auth = useAuthStore()

function handleLogout() {
  auth.logout()
  router.push('/login')
}

function backToUserApp() {
  // 跳回用户端入口（与用户端共享 token，无需重新登录）。
  // admin.html 独立入口下用户端路由不在本路由表，需整页跳到用户端文档
  if (window.location.pathname.endsWith('/admin.html')) {
    window.location.href = '/#/workspace'
    return
  }
  router.push('/workspace')
}
</script>

<template>
  <SidebarProvider class="h-svh overflow-hidden">
    <AdminSidebar @logout="handleLogout" @back-to-user="backToUserApp" />

    <SidebarInset class="h-svh overflow-hidden">
      <AppHeader :crumbs="[]" />

      <main class="relative min-h-0 grow overflow-auto px-4 pb-4">
        <router-view />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
