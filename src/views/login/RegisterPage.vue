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
const { warning, error } = useUiFeedback()

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const { countdown, send } = useCodeCountdown()

// 纯 UI：密码可见性切换（原 EP 输入框 show-password）
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handleSendCode() {
  if (!email.value) { warning('请输入邮箱'); return }
  if (!EMAIL_RE.test(email.value)) { warning('邮箱格式不正确'); return }
  await send(email.value, 'register')
}

async function handleRegister() {
  if (!email.value || !code.value || !password.value) {
    warning('请填写邮箱、验证码和密码')
    return
  }
  if (!EMAIL_RE.test(email.value)) { warning('邮箱格式不正确'); return }
  if (password.value.length < 6) { warning('密码至少6位'); return }
  if (password.value !== confirmPassword.value) { warning('两次密码不一致'); return }

  loading.value = true
  try {
    const ok = await auth.register(email.value, code.value, password.value)
    if (ok) router.push('/workspace')
  } catch (err: any) {
    error(err.response?.data?.error || '注册失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full">
    <form class="flex flex-col gap-4" @submit.prevent="handleRegister">
      <div class="grid gap-1.5">
        <Label for="register-email">邮箱</Label>
        <Input
          id="register-email"
          v-model="email"
          placeholder="请输入邮箱"
          class="h-9"
          :disabled="loading"
        />
      </div>
      <div class="grid gap-1.5">
        <Label for="register-code">验证码</Label>
        <div class="flex gap-2">
          <Input
            id="register-code"
            v-model="code"
            placeholder="请输入验证码"
            class="h-9 flex-1"
            :disabled="loading"
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
      <div class="grid gap-1.5">
        <Label for="register-password">密码</Label>
        <div class="relative">
          <Input
            id="register-password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="至少6位"
            class="h-9 pr-9"
            :disabled="loading"
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
      <div class="grid gap-1.5">
        <Label for="register-confirm-password">确认密码</Label>
        <div class="relative">
          <Input
            id="register-confirm-password"
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            placeholder="请再次输入密码"
            class="h-9 pr-9"
            :disabled="loading"
            @keyup.enter="handleRegister"
          />
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
            :title="showConfirmPassword ? '隐藏密码' : '显示密码'"
            @click="showConfirmPassword = !showConfirmPassword"
          >
            <EyeOff v-if="showConfirmPassword" class="size-4" />
            <Eye v-else class="size-4" />
          </button>
        </div>
      </div>
      <Button
        type="button"
        size="lg"
        :disabled="loading"
        class="mt-2 w-full"
        @click="handleRegister"
      >
        <LoaderCircle v-if="loading" class="animate-spin" />
        注册
      </Button>
    </form>

    <div class="text-muted-foreground mt-5 flex items-center justify-center gap-1 text-sm">
      <span>已有账号？</span>
      <router-link to="/login" class="text-primary hover:underline">去登录</router-link>
    </div>
  </div>
</template>
