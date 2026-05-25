<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import MainLayout from '@/layouts/MainLayout.vue'

const route = useRoute()
const isLoginPage = computed(() => route.path === '/login')
</script>

<template>
  <AuthLayout v-if="isLoginPage">
    <router-view />
  </AuthLayout>
  <MainLayout v-else>
    <router-view />
  </MainLayout>
</template>
