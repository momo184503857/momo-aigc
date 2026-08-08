<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import MainLayout from '@/layouts/MainLayout.vue'

const route = useRoute()
// 登录/注册/忘记密码等无需鉴权的页面走 AuthLayout
const isGuestPage = computed(() => !!route.meta.guest)
</script>

<template>
  <AuthLayout v-if="isGuestPage">
    <router-view />
  </AuthLayout>
  <MainLayout v-else>
    <router-view />
  </MainLayout>
</template>
