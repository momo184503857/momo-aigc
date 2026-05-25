<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  MagicStick,
  PictureFilled,
  Document,
  Setting,
  UserFilled,
  List,
  DataAnalysis,
  SwitchButton,
} from '@element-plus/icons-vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

interface MenuItem {
  path: string
  title: string
  icon: any
  adminOnly?: boolean
}

const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    { path: '/workspace', title: '生图工作台', icon: MagicStick },
    { path: '/templates', title: '模板图库', icon: PictureFilled },
    { path: '/tasks', title: '任务历史', icon: Document },
    { path: '/settings/key', title: 'API Key 设置', icon: Setting },
  ]

  if (auth.isAdmin) {
    items.push(
      { path: '/admin/users', title: '用户管理', icon: UserFilled, adminOnly: true },
      { path: '/admin/tasks', title: '任务管理', icon: List, adminOnly: true },
      { path: '/admin/stats', title: '生成统计', icon: DataAnalysis, adminOnly: true },
    )
  }

  return items
})

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-brand" @click="router.push('/workspace')">
      <span class="brand-text">墨墨 AI 生图</span>
    </div>

    <nav class="sidebar-nav">
      <div
        v-for="item in menuItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path), 'admin-item': item.adminOnly }"
        @click="navigate(item.path)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-title">{{ item.title }}</span>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="nav-item" @click="auth.logout(); router.push('/login')">
        <el-icon class="nav-icon"><SwitchButton /></el-icon>
        <span class="nav-title">退出登录</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--tf-sidebar-width, 220px);
  background: var(--tf-sidebar-bg);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-brand {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
}

.brand-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.nav-item {
  height: var(--tf-sidebar-menu-height, 48px);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-radius: var(--tf-sidebar-menu-radius, 8px);
  color: var(--tf-sidebar-text);
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.nav-item:hover {
  background: var(--el-fill-color-light);
  color: var(--tf-sidebar-text-hover);
}

.nav-item.active {
  background: var(--tf-sidebar-active-bg);
  color: var(--el-color-primary);
  font-weight: 500;
}

.admin-item {
  margin-top: 8px;
}

.admin-item::before {
  content: '';
  display: block;
}

.nav-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.nav-title {
  font-size: 14px;
  white-space: nowrap;
}
</style>
