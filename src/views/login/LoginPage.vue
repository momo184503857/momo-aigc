<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, LoaderCircle } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useCodeCountdown } from '@/composables/useCodeCountdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
const { countdown, send } = useCodeCountdown()

// 纯 UI：密码可见性切换（原 EP 输入框 show-password）
const showPassword = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handlePasswordLogin() {
  if (!account.value || !password.value) {
    warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const ok = await auth.login(account.value, password.value)
    if (ok) router.push('/workspace')
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
  if (!email.value || !code.value) {
    warning('请输入邮箱和验证码')
    return
  }
  loading.value = true
  try {
    const ok = await auth.loginWithCode(email.value, code.value)
    if (ok) router.push('/workspace')
  } catch (err: any) {
    error(err.response?.data?.error || '登录失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full">
    <Tabs
      :model-value="activeTab"
      class="w-full"
      @update:model-value="(v) => { activeTab = String(v) as 'password' | 'code' }"
    >
      <TabsList class="w-full">
        <TabsTrigger value="password">密码登录</TabsTrigger>
        <TabsTrigger value="code">验证码登录</TabsTrigger>
      </TabsList>

      <TabsContent value="password">
        <form class="flex flex-col gap-4" @submit.prevent="handlePasswordLogin">
          <div class="grid gap-1.5">
            <Label for="login-account">邮箱 / 用户名</Label>
            <Input
              id="login-account"
              v-model="account"
              placeholder="请输入邮箱或用户名"
              class="h-9"
              :disabled="loading"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="login-password">密码</Label>
            <div class="relative">
              <Input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                class="h-9 pr-9"
                :disabled="loading"
                @keyup.enter="handlePasswordLogin"
              />
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                :title="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" class="size-4" />
                <Eye v-else class="size-4" />
              </button>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            :disabled="loading"
            class="mt-2 w-full"
            @click="handlePasswordLogin"
          >
            <LoaderCircle v-if="loading" class="animate-spin" />
            登录
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="code">
        <form class="flex flex-col gap-4" @submit.prevent="handleCodeLogin">
          <div class="grid gap-1.5">
            <Label for="login-email">邮箱</Label>
            <Input
              id="login-email"
              v-model="email"
              placeholder="请输入注册邮箱"
              class="h-9"
              :disabled="loading"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="login-code">验证码</Label>
            <div class="flex gap-2">
              <Input
                id="login-code"
                v-model="code"
                placeholder="请输入验证码"
                class="h-9 flex-1"
                :disabled="loading"
                @keyup.enter="handleCodeLogin"
              />
              <Button
                type="button"
                variant="outline"
                size="lg"
                class="shrink-0"
                :disabled="countdown > 0 || loading"
                @click="handleSendCode"
              >
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </Button>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            :disabled="loading"
            class="mt-2 w-full"
            @click="handleCodeLogin"
          >
            <LoaderCircle v-if="loading" class="animate-spin" />
            登录
          </Button>
        </form>
      </TabsContent>
    </Tabs>

    <div class="mt-5 flex justify-between text-sm">
      <router-link to="/forgot-password" class="text-primary hover:underline">忘记密码？</router-link>
      <router-link to="/register" class="text-primary hover:underline">注册账号</router-link>
    </div>
  </div>
</template>
