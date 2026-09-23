<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import MainLayout from '@/layouts/MainLayout.vue'
import AdminApp from '@/admin/AdminApp.vue'
import FeedbackHost from '@/components/FeedbackHost.vue'

const route = useRoute()
const isPrototype = computed(() => import.meta.env.DEV && !!route.meta.prototype)
// 登录/注册/忘记密码等无需鉴权的页面走 AuthLayout
const isGuestPage = computed(() => !!route.meta.guest)
// 管理后台走独立壳子 AdminApp（自带 AdminSidebar / AdminAuthLayout）
const isAdminPage = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <router-view v-if="isPrototype" />
  <AuthLayout v-else-if="isGuestPage">
    <router-view />
  </AuthLayout>
  <AdminApp v-else-if="isAdminPage">
    <router-view />
  </AdminApp>
  <MainLayout v-else>
    <router-view />
  </MainLayout>

  <!-- /admin 路由由 AdminApp 自带 FeedbackHost，避免同一单例状态被挂载两次 -->
  <FeedbackHost v-if="!isAdminPage && !isPrototype" />
</template>
