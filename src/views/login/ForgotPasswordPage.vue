<script setup lang="ts">
import { Button, Input, DsField, DsPasswordInput } from '@/components/design-system'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoaderCircle } from '@lucide/vue'
import { authApi } from '@/services/authApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useCodeCountdown } from '@/composables/useCodeCountdown'
const { success, warning, error } = useUiFeedback()

const router = useRouter()

const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const { countdown, sending, send } = useCodeCountdown()


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handleSendCode() {
  if (!email.value) { warning('请输入邮箱'); return }
  if (!EMAIL_RE.test(email.value)) { warning('邮箱格式不正确'); return }
  await send(email.value, 'reset_password')
}

async function handleReset() {
  if (loading.value) return
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
    <form class="ds-auth-form" @submit.prevent="handleReset">
      <DsField v-slot="field" label="邮箱" required>
        <Input :id="field.id" v-model="email" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入邮箱" :disabled="loading" autocomplete="email" />
      </DsField>
      <DsField v-slot="field" label="验证码" required>
        <div class="ds-code-input">
          <Input :id="field.id" v-model="code" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入验证码" autocomplete="one-time-code" :disabled="loading" />
          <Button variant="outline" :disabled="countdown > 0 || loading || sending" @click="handleSendCode">{{ sending ? '发送中…' : countdown > 0 ? `${countdown}s` : '获取验证码' }}</Button>
        </div>
      </DsField>
      <DsField v-slot="field" label="新密码" required>
        <DsPasswordInput :id="field.id" v-model="newPassword" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="至少6位" :disabled="loading" autocomplete="new-password" />
      </DsField>
      <DsField v-slot="field" label="确认密码" required>
        <DsPasswordInput :id="field.id" v-model="confirmPassword" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请再次输入密码" :disabled="loading" autocomplete="new-password" />
      </DsField>
      <Button type="submit" :disabled="loading" :aria-busy="loading">
        <LoaderCircle v-if="loading" class="animate-spin" aria-hidden="true" />重置密码</Button>
    </form>
    <div class="ds-auth-footer">
      <router-link to="/login" class="ds-link">返回登录</router-link>
    </div>
  </div>
</template>
