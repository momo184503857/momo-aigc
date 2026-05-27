<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useServerStatusStore } from '@/stores/serverStatus'
import { Fold, Expand } from '@element-plus/icons-vue'
import SidebarMenu from '@/components/SidebarMenu.vue'

const auth = useAuthStore()
const serverStatus = useServerStatusStore()
const router = useRouter()
const route = useRoute()

const sidebarCollapsed = ref(false)

onMounted(() => {
  serverStatus.fetchStatus()
})

const pageTitle = computed(() => route.meta.title as string || '')
</script>

<template>
  <div class="main-layout">
    <SidebarMenu :collapsed="sidebarCollapsed" />
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
        <div class="header-right">
          <el-tag type="info" size="small" v-if="auth.user">
            {{ auth.user.role === 'admin' ? '管理员' : '用户' }}：{{ auth.user.username }}
          </el-tag>
          <el-button size="small" plain @click="auth.logout(); router.push('/login')">退出登录</el-button>
        </div>
      </div>
      <div class="main-body">
        <router-view v-slot="{ Component }">
          <KeepAlive :include="['Workspace']">
            <component :is="Component" />
          </KeepAlive>
        </router-view>
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

.header-left {
  display: flex; align-items: center; gap: 10px;
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
