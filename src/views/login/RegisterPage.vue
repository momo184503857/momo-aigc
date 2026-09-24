<script setup lang="ts">
import { Button, Input, DsField, DsPasswordInput } from '@/components/design-system'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoaderCircle } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useCodeCountdown } from '@/composables/useCodeCountdown'
const { warning, error } = useUiFeedback()

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const { countdown, sending, send } = useCodeCountdown()


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handleSendCode() {
  if (!email.value) { warning('请输入邮箱'); return }
  if (!EMAIL_RE.test(email.value)) { warning('邮箱格式不正确'); return }
  await send(email.value, 'register')
}

async function handleRegister() {
  if (loading.value) return
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
    <form class="ds-auth-form" @submit.prevent="handleRegister">
      <DsField v-slot="field" label="邮箱" required>
        <Input :id="field.id" v-model="email" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入邮箱" :disabled="loading" autocomplete="email" />
      </DsField>
      <DsField v-slot="field" label="验证码" required>
        <div class="ds-code-input">
          <Input :id="field.id" v-model="code" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请输入验证码" autocomplete="one-time-code" :disabled="loading" />
          <Button variant="outline" :disabled="countdown > 0 || loading || sending" @click="handleSendCode">{{ sending ? '发送中…' : countdown > 0 ? `${countdown}s` : '获取验证码' }}</Button>
        </div>
      </DsField>
      <DsField v-slot="field" label="密码" required>
        <DsPasswordInput :id="field.id" v-model="password" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="至少6位" :disabled="loading" autocomplete="new-password" />
      </DsField>
      <DsField v-slot="field" label="确认密码" required>
        <DsPasswordInput :id="field.id" v-model="confirmPassword" :aria-describedby="field.describedby" :aria-invalid="field.invalid" placeholder="请再次输入密码" :disabled="loading" autocomplete="new-password" />
      </DsField>
      <Button type="submit" :disabled="loading" :aria-busy="loading">
        <LoaderCircle v-if="loading" class="animate-spin" aria-hidden="true" />注册</Button>
    </form>
    <div class="ds-auth-footer">
      <router-link to="/login" class="ds-link">返回登录</router-link>
    </div>
  </div>
</template>
