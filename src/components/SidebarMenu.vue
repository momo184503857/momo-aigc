<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  MagicStick,
  PictureFilled,
  Picture,
  Collection,
  UserFilled,
  List,
  DataAnalysis,
  EditPen,
  Key,
} from '@element-plus/icons-vue'

defineProps<{ collapsed?: boolean }>()

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

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
      title: '',
      items: [
        { path: '/workspace', title: '生图工作台', icon: MagicStick },
      ],
    },
    {
      title: '资产管理',
      items: [
        { path: '/templates', title: '模板图库', icon: PictureFilled },
        { path: '/prompts', title: '提示词库', icon: Collection },
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
        { path: '/admin/tasks', title: '任务管理', icon: List },
        { path: '/admin/templates', title: '模板管理', icon: PictureFilled },
        { path: '/admin/feature-prompts', title: '功能提示词', icon: EditPen },
        { path: '/admin/stats', title: '生成统计', icon: DataAnalysis },
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
  router.push(path)
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
  transition: width var(--tf-sidebar-transition, 0.3s ease);
}

.sidebar.collapsed {
  width: var(--tf-sidebar-collapsed-width, 64px);
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
  height: var(--tf-sidebar-menu-height, 42px);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-radius: var(--tf-sidebar-menu-radius, 8px);
  color: var(--tf-sidebar-text);
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 2px;
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
</style>
