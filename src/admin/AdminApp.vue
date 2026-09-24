<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AdminAuthLayout from './layouts/AdminAuthLayout.vue'
import AdminLayout from './layouts/AdminLayout.vue'
import ApplicationTheme from '@/components/ApplicationTheme.vue'

const route = useRoute()
// 管理后台登录页走独立 AuthLayout，其余走 AdminLayout
const isGuestPage = computed(() => !!route.meta.guest)
</script>

<template>
  <ApplicationTheme>
  <AdminAuthLayout v-if="isGuestPage">
    <router-view />
  </AdminAuthLayout>
  <AdminLayout v-else>
    <router-view />
  </AdminLayout>

  </ApplicationTheme>
</template>
