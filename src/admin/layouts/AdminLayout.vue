<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import AdminSidebar from './AdminSidebar.vue'

useModelCatalogStore().ensureLoaded()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const sidebarCollapsed = ref(false)
const pageTitle = computed(() => (route.meta.title as string) || '')

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
  <div class="admin-layout">
    <AdminSidebar
      :collapsed="sidebarCollapsed"
      @logout="handleLogout"
      @back-to-user="backToUserApp"
    />
    <div class="main-content">
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
      <div class="main-body">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
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
  display: flex;
  align-items: center;
  gap: 10px;
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
</style>
