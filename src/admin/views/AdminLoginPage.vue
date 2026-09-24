<script setup lang="ts">
import { Button, Input, DsField, DsPasswordInput } from '@/components/design-system'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { LoaderCircle } from '@lucide/vue'

const auth = useAuthStore()
const router = useRouter()
const { warning, error } = useUiFeedback()

const account = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (loading.value) return
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

</script>

<template>
  <div class="w-full">
    <form class="ds-auth-form" @submit.prevent="handleLogin">
      <DsField v-slot="field" label="邮箱 / 用户名" required>
        <Input :id="field.id" v-model="account" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入邮箱或用户名" :disabled="loading" autocomplete="username" />
      </DsField>
      <DsField v-slot="field" label="密码" required>
        <DsPasswordInput :id="field.id" v-model="password" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入密码" :disabled="loading" autocomplete="current-password" />
      </DsField>
      <Button type="submit" :disabled="loading" :aria-busy="loading">
        <LoaderCircle v-if="loading" class="animate-spin" aria-hidden="true" />登录管理后台</Button>
    </form>
    <div class="ds-auth-footer">
      <a href="/" class="ds-link">返回用户端</a>
    </div>
  </div>
</template>
