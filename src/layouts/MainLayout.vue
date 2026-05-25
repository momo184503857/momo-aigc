<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import SidebarMenu from '@/components/SidebarMenu.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const pageTitle = computed(() => route.meta.title as string || '')
</script>

<template>
  <div class="main-layout">
    <SidebarMenu />
    <div class="main-content">
      <div class="main-header">
        <span class="page-title">{{ pageTitle }}</span>
        <div class="header-right">
          <el-tag type="info" size="small" v-if="auth.user">
            {{ auth.user.role === 'admin' ? '管理员' : '用户' }}：{{ auth.user.username }}
          </el-tag>
          <el-button text @click="auth.logout(); router.push('/login')">退出登录</el-button>
        </div>
      </div>
      <div class="main-body">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-layout {
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
  justify-content: space-between;
  padding: 0 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.page-title {
  font-size: var(--tf-page-title-size, 22px);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.main-body {
  flex: 1;
  padding: var(--tf-page-padding, 20px);
  overflow: auto;
}
</style>
