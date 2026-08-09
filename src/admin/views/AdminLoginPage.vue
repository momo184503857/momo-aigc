<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'

const auth = useAuthStore()
const router = useRouter()
const { warning, error } = useUiFeedback()

const account = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!account.value || !password.value) {
    warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const ok = await auth.login(account.value, password.value)
    if (!ok) return
    // 仅允许管理员进入后台
    if (!auth.isAdmin) {
      warning('该账号无管理员权限')
      auth.clear()
      password.value = ''
      return
    }
    router.replace('/users')
  } catch (err: any) {
    error(err.response?.data?.error || '登录失败，请重试')
  } finally {
    loading.value = false
  }
}

function backToUserApp() {
  window.location.href = '/'
}
</script>

<template>
  <div class="admin-login-page">
    <el-form @submit.prevent="handleLogin" label-position="top">
      <el-form-item label="邮箱 / 用户名">
        <el-input
          v-model="account"
          placeholder="请输入邮箱或用户名"
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
        class="submit-btn"
        @click="handleLogin"
      >
        登录管理后台
      </el-button>
    </el-form>

    <div class="login-footer">
      <a class="link" @click="backToUserApp">返回用户端</a>
    </div>
  </div>
</template>

<style scoped>
.admin-login-page {
  width: 100%;
}

.submit-btn {
  width: 100%;
  margin-top: 8px;
}

.login-footer {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  font-size: var(--momo-font-size-sm);
}

.login-footer .link {
  color: var(--momo-color-brand);
  text-decoration: none;
  cursor: pointer;
}

.login-footer .link:hover {
  text-decoration: underline;
}
</style>
