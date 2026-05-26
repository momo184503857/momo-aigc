<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error } = useUiFeedback()

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!username.value || !password.value) {
    warning('请输入用户名和密码')
    return
  }

  loading.value = true
  try {
    const ok = await auth.login(username.value, password.value)
    if (ok) {
      router.push('/workspace')
    }
  } catch (err: any) {
    const msg = err.response?.data?.error || '登录失败，请重试'
    error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-form @submit.prevent="handleLogin" label-position="top">
      <el-form-item label="用户名">
        <el-input
          v-model="username"
          placeholder="请输入用户名"
          size="large"
          :disabled="loading"
        />
      </el-form-item>
      <el-form-item label="密码">
        <el-input
          v-model="password"
          type="password"
          placeholder="请输入密码"
          size="large"
          show-password
          :disabled="loading"
          @keyup.enter="handleLogin"
        />
      </el-form-item>
      <el-button
        type="primary"
        size="large"
        :loading="loading"
        class="login-btn"
        @click="handleLogin"
      >
        登录
      </el-button>
    </el-form>
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
}
</style>
