<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import AppHeader from '@/components/AppHeader.vue'
import { SidebarInset, SidebarProvider } from '@/components/design-system/primitives/sidebar'
import AdminSidebar from './AdminSidebar.vue'

useModelCatalogStore().ensureLoaded()

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

function handleLogout() {
  auth.logout()
  router.push('/login')
}

function backToUserApp() {
  // 跳回用户端入口（与用户端共享 token，无需重新登录）。
  // admin.html 独立入口下用户端路由不在本路由表，需整页跳到用户端文档
  if (window.location.pathname.endsWith('/admin.html')) {
    window.location.href = '/#/free-gen'
    return
  }
  router.push('/free-gen')
}
</script>

<template>
  <SidebarProvider class="h-svh overflow-hidden" persist keyboard-shortcut storage-key="sidebar_state">
    <AdminSidebar @logout="handleLogout" @back-to-user="backToUserApp" />

    <SidebarInset class="h-svh overflow-hidden">
      <AppHeader :crumbs="[]" />

      <main class="relative min-h-0 grow overflow-auto px-4 pb-4">
        <div class="min-w-0"><router-view /></div>
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
