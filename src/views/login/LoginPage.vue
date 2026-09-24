<script setup lang="ts">
import { Button, Input, DsField, DsPasswordInput, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/design-system'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoaderCircle } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useCodeCountdown } from '@/composables/useCodeCountdown'
const { warning, error } = useUiFeedback()

const auth = useAuthStore()
const router = useRouter()

const activeTab = ref<'password' | 'code'>('password')

// 密码登录
const account = ref('')
const password = ref('')
// 验证码登录
const email = ref('')
const code = ref('')

const loading = ref(false)
const { countdown, sending, send } = useCodeCountdown()


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handlePasswordLogin() {
  if (loading.value) return
  if (!account.value || !password.value) {
    warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const ok = await auth.login(account.value, password.value)
    if (ok) router.push('/free-gen')
  } catch (err: any) {
    error(err.response?.data?.error || '登录失败，请重试')
  } finally {
    loading.value = false
  }
}

async function handleSendCode() {
  if (!email.value) { warning('请输入邮箱'); return }
  if (!EMAIL_RE.test(email.value)) { warning('邮箱格式不正确'); return }
  await send(email.value, 'login')
}

async function handleCodeLogin() {
  if (loading.value) return
  if (!email.value || !code.value) {
    warning('请输入邮箱和验证码')
    return
  }
  loading.value = true
  try {
    const ok = await auth.loginWithCode(email.value, code.value)
    if (ok) router.push('/free-gen')
  } catch (err: any) {
    error(err.response?.data?.error || '登录失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full">
    <Tabs v-model="activeTab" class="ds-auth-tabs">
      <TabsList>
        <TabsTrigger value="password">密码登录</TabsTrigger>
        <TabsTrigger value="code">验证码登录</TabsTrigger>
      </TabsList>
      <TabsContent value="password">
        <form class="ds-auth-form" @submit.prevent="handlePasswordLogin">
          <DsField v-slot="field" label="邮箱 / 用户名" required>
            <Input :id="field.id" v-model="account" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入邮箱或用户名" :disabled="loading" autocomplete="username" />
          </DsField>
          <DsField v-slot="field" label="密码" required>
            <DsPasswordInput :id="field.id" v-model="password" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入密码" :disabled="loading" autocomplete="current-password" />
          </DsField>
          <Button type="submit" :disabled="loading" :aria-busy="loading">
            <LoaderCircle v-if="loading" class="animate-spin" aria-hidden="true" />登录</Button>
        </form>
      </TabsContent>
      <TabsContent value="code">
        <form class="ds-auth-form" @submit.prevent="handleCodeLogin">
          <DsField v-slot="field" label="邮箱" required>
            <Input :id="field.id" v-model="email" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入注册邮箱" :disabled="loading" autocomplete="email" />
          </DsField>
          <DsField v-slot="field" label="验证码" required>
            <div class="ds-code-input">
              <Input :id="field.id" v-model="code" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入验证码" autocomplete="one-time-code" :disabled="loading" />
              <Button variant="outline" :disabled="countdown > 0 || loading || sending" @click="handleSendCode">{{ sending ? '发送中…' : countdown > 0 ? `${countdown}s` : '获取验证码' }}</Button>
            </div>
          </DsField>
          <Button type="submit" :disabled="loading" :aria-busy="loading">
            <LoaderCircle v-if="loading" class="animate-spin" aria-hidden="true" />登录</Button>
        </form>
      </TabsContent>
    </Tabs>
    <div class="ds-auth-footer">
      <router-link to="/register" class="ds-link">注册账号</router-link>
      <router-link to="/forgot-password" class="ds-link">忘记密码？</router-link>
    </div>
  </div>
</template>
