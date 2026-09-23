<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, LoaderCircle } from '@lucide/vue'
import { authApi } from '@/services/authApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useCodeCountdown } from '@/composables/useCodeCountdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
const { success, warning, error } = useUiFeedback()

const router = useRouter()

const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const { countdown, send } = useCodeCountdown()

// 纯 UI：密码可见性切换（原 EP 输入框 show-password）
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handleSendCode() {
  if (!email.value) { warning('请输入邮箱'); return }
  if (!EMAIL_RE.test(email.value)) { warning('邮箱格式不正确'); return }
  await send(email.value, 'reset_password')
}

async function handleReset() {
  if (!email.value || !code.value || !newPassword.value) {
    warning('请填写邮箱、验证码和新密码')
    return
  }
  if (newPassword.value.length < 6) { warning('密码至少6位'); return }
  if (newPassword.value !== confirmPassword.value) { warning('两次密码不一致'); return }

  loading.value = true
  try {
    await authApi.resetPassword(email.value, code.value, newPassword.value)
    success('密码已重置，请重新登录')
    router.push('/login')
  } catch (err: any) {
    error(err.response?.data?.error || '重置失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full">
    <form class="flex flex-col gap-4" @submit.prevent="handleReset">
      <div class="grid gap-1.5">
        <Label for="forgot-email">邮箱</Label>
        <Input
          id="forgot-email"
          v-model="email"
          placeholder="请输入注册邮箱"
          class="h-9"
          :disabled="loading"
        />
      </div>
      <div class="grid gap-1.5">
        <Label for="forgot-code">验证码</Label>
        <div class="flex gap-2">
          <Input
            id="forgot-code"
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
        <Label for="forgot-new-password">新密码</Label>
        <div class="relative">
          <Input
            id="forgot-new-password"
            v-model="newPassword"
            :type="showNewPassword ? 'text' : 'password'"
            placeholder="至少6位"
            class="h-9 pr-9"
            :disabled="loading"
          />
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
            :title="showNewPassword ? '隐藏密码' : '显示密码'"
            @click="showNewPassword = !showNewPassword"
          >
            <EyeOff v-if="showNewPassword" class="size-4" />
            <Eye v-else class="size-4" />
          </button>
        </div>
      </div>
      <div class="grid gap-1.5">
        <Label for="forgot-confirm-password">确认密码</Label>
        <div class="relative">
          <Input
            id="forgot-confirm-password"
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            placeholder="请再次输入新密码"
            class="h-9 pr-9"
            :disabled="loading"
            @keyup.enter="handleReset"
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
        @click="handleReset"
      >
        <LoaderCircle v-if="loading" class="animate-spin" />
        重置密码
      </Button>
    </form>

    <div class="mt-5 flex justify-center text-sm">
      <router-link to="/login" class="text-primary hover:underline">返回登录</router-link>
    </div>
  </div>
</template>
