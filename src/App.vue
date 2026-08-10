<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import MainLayout from '@/layouts/MainLayout.vue'
import AdminApp from '@/admin/AdminApp.vue'

const route = useRoute()
// 登录/注册/忘记密码等无需鉴权的页面走 AuthLayout
const isGuestPage = computed(() => !!route.meta.guest)
// 管理后台走独立壳子 AdminApp（自带 AdminSidebar / AdminAuthLayout）
const isAdminPage = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <AuthLayout v-if="isGuestPage">
    <router-view />
  </AuthLayout>
  <AdminApp v-else-if="isAdminPage">
    <router-view />
  </AdminApp>
  <MainLayout v-else>
    <router-view />
  </MainLayout>
</template>
