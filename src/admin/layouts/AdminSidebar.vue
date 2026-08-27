<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  UserFilled,
  DataBoard,
  PictureFilled,
  EditPen,
  Camera,
  Trophy,
  Picture,
  Grid,
  Coin,
  Setting,
  ArrowDown,
  Back,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { formatCredits } from '@/types/adapter'

defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ (e: 'logout'): void; (e: 'back-to-user'): void }>()

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

interface MenuItem {
  path: string
  title: string
  icon: any
}

const menuItems: MenuItem[] = [
  { path: '/admin/users', title: '用户管理', icon: UserFilled },
  { path: '/admin/dashboard', title: '生图日志', icon: DataBoard },
  { path: '/admin/templates', title: '模板管理', icon: PictureFilled },
  { path: '/admin/feature-prompts', title: '功能提示词', icon: EditPen },
  { path: '/admin/photography', title: 'AI摄影配置', icon: Camera },
  { path: '/admin/works', title: '作品库管理', icon: Trophy },
  { path: '/admin/prompt-cases', title: '提示词案例', icon: Picture },
  { path: '/admin/prompt-modules', title: '提示词模块', icon: Grid },
  { path: '/admin/sg-assets', title: '成套生图资产', icon: Grid },
  { path: '/admin/ai-config', title: '配置', icon: Setting },
]

const creditsLabel = computed(() => formatCredits(auth.user?.points ?? 0, { creditDigits: 0, yuanDigits: 2 }))

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(path + '/')
}

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <aside class="admin-sidebar" :class="{ collapsed }">
    <div class="sidebar-brand">
      <span v-if="!collapsed" class="brand-text">墨墨管理后台</span>
      <span v-else class="brand-text-short">管理</span>
    </div>

    <nav class="sidebar-nav">
      <div
        v-for="item in menuItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        @click="navigate(item.path)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span v-if="!collapsed" class="nav-title">{{ item.title }}</span>
      </div>
    </nav>

    <!-- 底部：返回用户端 + 当前管理员 -->
    <div class="sidebar-footer">
      <div class="back-user" @click="emit('back-to-user')">
        <el-icon class="nav-icon"><Back /></el-icon>
        <span v-if="!collapsed" class="nav-title">返回用户端</span>
      </div>

      <div v-if="auth.user" class="sidebar-user">
        <div class="user-points-row">
          <el-icon :size="14"><Coin /></el-icon>
          <span v-if="!collapsed" class="user-points-text">{{ creditsLabel }}</span>
        </div>
        <div class="user-account-row">
          <div class="user-avatar">{{ auth.displayName.charAt(0).toUpperCase() }}</div>
          <span v-if="!collapsed" class="user-name">{{ auth.displayName }}</span>
        </div>
        <div class="logout-btn" @click="emit('logout')">
          <span v-if="!collapsed">退出登录</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.admin-sidebar {
  width: var(--momo-sidebar-width);
  background: var(--momo-sidebar-bg);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--momo-sidebar-transition);
}

.admin-sidebar.collapsed {
  width: var(--momo-sidebar-collapsed-width);
}

.sidebar-brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.brand-text {
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.brand-text-short {
  font-size: var(--momo-font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  height: var(--momo-sidebar-menu-height);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: var(--momo-radius-md);
  cursor: pointer;
  color: var(--momo-sidebar-text);
  transition: background var(--momo-transition-fast), color var(--momo-transition-fast);
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--momo-sidebar-hover-bg);
}

.nav-item.active {
  background: var(--momo-sidebar-active-bg);
  color: var(--momo-sidebar-active-text);
  font-weight: 500;
}

.nav-icon {
  flex-shrink: 0;
  font-size: 16px;
}

.nav-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 8px;
}

.back-user {
  height: var(--momo-sidebar-menu-height);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: var(--momo-radius-md);
  cursor: pointer;
  color: var(--momo-color-text-secondary);
  transition: background var(--momo-transition-fast), color var(--momo-transition-fast);
  white-space: nowrap;
  margin-bottom: 4px;
}

.back-user:hover {
  background: var(--momo-sidebar-hover-bg);
  color: var(--momo-color-text);
}

.sidebar-user {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
}

.user-points-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-warning);
  font-size: var(--momo-font-size-sm);
}

.user-account-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: var(--el-color-white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-name {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-btn {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  cursor: pointer;
  padding-top: 2px;
}

.logout-btn:hover {
  color: var(--el-color-danger);
}
</style>
