<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTabStore } from '@/stores/tabs'
import { useServerStatusStore } from '@/stores/serverStatus'
import { formatCredits } from '@/types/adapter'
import {
  MagicStick,
  PictureFilled,
  Picture,
  Collection,
  UserFilled,
  EditPen,
  Key,
  Coin,
  DataBoard,
  ArrowDown,
  Share,
  Box,
  Camera,
  Goods,
  Setting,
  Money,
  TrendCharts,
  Trophy,
} from '@element-plus/icons-vue'

defineProps<{ collapsed?: boolean }>()

const auth = useAuthStore()
const tabStore = useTabStore()
const router = useRouter()
const route = useRoute()
const serverStatus = useServerStatusStore()

// 个人 Key 模式下，头像显示该 Key 的积分（来自 serverStatus 全局轮询）；
// 共享 Key 模式下显示平台积分。
const avatarCreditsLabel = computed(() => {
  if (serverStatus.usingPersonalKey) {
    return serverStatus.personalKeyCredits !== null
      ? formatCredits(serverStatus.personalKeyCredits, { creditDigits: 0, yuanDigits: 2 })
      : '个人 Key · 加载中…'
  }
  return formatCredits(auth.user?.points ?? 0, { creditDigits: 0, yuanDigits: 2 })
})

interface MenuItem {
  path: string
  title: string
  icon: any
}

interface MenuSection {
  title: string
  adminOnly?: boolean
  items: MenuItem[]
}

const menuSections = computed<MenuSection[]>(() => {
  const sections: MenuSection[] = [
    {
      title: 'AI生图',
      items: [
        { path: '/free-gen', title: '自由生图', icon: EditPen },
        { path: '/workspace', title: '快速生图', icon: MagicStick },
        { path: '/photography', title: 'AI摄影', icon: Camera },
        { path: '/canvas-projects', title: 'AI画布', icon: Share },
        { path: '/toolbox', title: 'AI工具箱', icon: Box },
        { path: '/buyer-show', title: 'AI买家秀', icon: Goods },
        { path: '/works', title: '作品库', icon: Trophy },
      ],
    },
    {
      title: '资产管理',
      items: [
        { path: '/templates', title: '模板图库', icon: PictureFilled },
        { path: '/prompts', title: '提示词库', icon: Collection },
        { path: '/prompt-workshop', title: '提示词工坊', icon: EditPen },
        { path: '/results', title: '生图结果', icon: Picture },
      ],
    },
  ]

  if (auth.isAdmin) {
    sections.push({
      title: '管理员',
      adminOnly: true,
      items: [
        { path: '/admin/users', title: '用户管理', icon: UserFilled },
        { path: '/admin/dashboard', title: '生图日志', icon: DataBoard },
        { path: '/admin/templates', title: '模板管理', icon: PictureFilled },
        { path: '/admin/feature-prompts', title: '功能提示词', icon: EditPen },
        { path: '/admin/photography', title: 'AI摄影配置', icon: Camera },
        { path: '/admin/works', title: '作品库管理', icon: Trophy },
        { path: '/admin/prompt-cases', title: '提示词案例', icon: Picture },
        { path: '/admin/toapis-key', title: 'API Key 管理', icon: Key },
      ],
    })
  }

  return sections
})

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

function handleCommand(command: string) {
  if (command === 'settings') {
    router.push('/settings')
  } else if (command === 'my-quota') {
    router.push('/my-quota')
  } else if (command === 'my-consumption') {
    router.push('/my-consumption')
  } else if (command === 'pricing') {
    router.push('/pricing')
  } else if (command === 'logout') {
    handleLogout()
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="sidebar-brand" @click="router.push('/workspace')">
      <span v-if="!collapsed" class="brand-text">墨墨 AI 生图</span>
      <span v-else class="brand-text-short">墨墨</span>
    </div>

    <nav class="sidebar-nav">
      <template v-for="section in menuSections" :key="section.title">
        <div v-if="section.title && !collapsed" class="section-title">{{ section.title }}</div>
        <div
          v-for="item in section.items"
          :key="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
          @click="navigate(item.path)"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span v-if="!collapsed" class="nav-title">{{ item.title }}</span>
        </div>
      </template>
    </nav>

    <!-- User section at bottom -->
    <div v-if="auth.user" class="sidebar-user">
      <div class="user-points-row">
        <el-icon :size="14"><Coin /></el-icon>
        <span v-if="!collapsed" class="user-points-text">{{ avatarCreditsLabel }}</span>
      </div>
      <el-dropdown trigger="click" @command="handleCommand" popper-class="sidebar-user-dropdown">
        <div class="user-account-row">
          <div class="user-avatar">{{ auth.displayName.charAt(0).toUpperCase() }}</div>
          <span v-if="!collapsed" class="user-name">{{ auth.displayName }}</span>
          <el-icon v-if="!collapsed" class="user-arrow"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item disabled>
              {{ auth.user.role === 'admin' ? '管理员' : '用户' }}
            </el-dropdown-item>
            <el-dropdown-item command="my-quota" :icon="Coin">我的额度</el-dropdown-item>
            <el-dropdown-item command="my-consumption" :icon="TrendCharts">我的消耗</el-dropdown-item>
            <el-dropdown-item command="pricing" :icon="Money">计费说明</el-dropdown-item>
            <el-dropdown-item command="settings" :icon="Setting">个人设置</el-dropdown-item>
            <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--momo-sidebar-width);
  background: var(--momo-sidebar-bg);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--momo-sidebar-transition);
}

.sidebar.collapsed {
  width: var(--momo-sidebar-collapsed-width);
}

.sidebar-brand {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
}

.collapsed .sidebar-brand {
  padding: 0 8px;
}

.brand-text {
  font-size: var(--momo-font-size-xl);
  font-weight: 700;
  color: var(--el-color-primary);
  white-space: nowrap;
  overflow: hidden;
}

.brand-text-short {
  font-size: var(--momo-font-size-lg);
  font-weight: 700;
  color: var(--el-color-primary);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  overflow-y: auto;
}

.section-title {
  font-size: var(--momo-font-size-xs);
  font-weight: 600;
  color: var(--el-text-color-placeholder);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 16px 16px 6px 16px;
}
.section-title:first-child {
  padding-top: 4px;
}

.nav-item {
  height: var(--momo-sidebar-menu-height);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-radius: var(--momo-radius-md);
  color: var(--momo-sidebar-text);
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 2px;
}

.nav-item:hover {
  background: var(--el-fill-color-light);
  color: var(--momo-sidebar-text-hover);
}

.nav-item.active {
  background: var(--momo-sidebar-active-bg);
  color: var(--el-color-primary);
  font-weight: 500;
}

.nav-icon {
  font-size: var(--momo-font-size-xl);
  flex-shrink: 0;
}

.nav-title {
  font-size: var(--momo-font-size-base);
  white-space: nowrap;
}

.collapsed .nav-item {
  justify-content: center;
  padding: 0;
}

.collapsed .nav-icon {
  font-size: 20px;
}

/* ─── User section ─── */
.sidebar-user {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 12px 8px;
  flex-shrink: 0;
}

.user-points-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  margin-bottom: 4px;
  color: var(--el-color-warning-dark-2);
  font-size: var(--momo-font-size-sm);
}

.collapsed .user-points-row {
  justify-content: center;
  padding: 6px 0;
}

.user-points-text {
  white-space: nowrap;
}

.user-account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--momo-radius-md);
  cursor: pointer;
  transition: background 0.2s;
}

.user-account-row:hover {
  background: var(--el-fill-color-light);
}

.collapsed .user-account-row {
  justify-content: center;
  padding: 8px 0;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: var(--el-color-white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--momo-font-size-sm);
  font-weight: 600;
  flex-shrink: 0;
}

.user-name {
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.user-arrow {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
</style>
