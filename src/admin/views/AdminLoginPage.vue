<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <form class="flex flex-col gap-4" @submit.prevent="handleLogin">
      <div class="grid gap-1.5">
        <Label for="admin-account">邮箱 / 用户名</Label>
        <Input
          id="admin-account"
          v-model="account"
          placeholder="请输入邮箱或用户名"
          class="h-9"
          :disabled="loading"
        />
      </div>
      <div class="grid gap-1.5">
        <Label for="admin-password">密码</Label>
        <Input
          id="admin-password"
          v-model="password"
          type="password"
          placeholder="请输入密码"
          class="h-9"
          :disabled="loading"
          @keyup.enter="handleLogin"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        :disabled="loading"
        class="submit-btn"
      >
        <LoaderCircle v-if="loading" class="animate-spin" />
        登录管理后台
      </Button>
    </form>

    <div class="login-footer">
      <a class="link" title="返回用户端" @click="backToUserApp">返回用户端</a>
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
