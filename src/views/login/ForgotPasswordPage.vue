<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
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
const { countdown, send } = useCodeCountdown()

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
  <div class="forgot-page">
    <el-form @submit.prevent="handleReset" label-position="top">
      <el-form-item label="邮箱">
        <el-input
          v-model="email"
          placeholder="请输入注册邮箱"
          size="large"
          :disabled="loading"
        />
      </el-form-item>
      <el-form-item label="验证码">
        <div class="code-row">
          <el-input
            v-model="code"
            placeholder="请输入验证码"
            size="large"
            :disabled="loading"
          />
          <el-button
            size="large"
            :disabled="countdown > 0 || loading"
            @click="handleSendCode"
          >
            {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
          </el-button>
        </div>
      </el-form-item>
      <el-form-item label="新密码">
        <el-input
          v-model="newPassword"
          type="password"
          placeholder="至少6位"
          size="large"
          show-password
          :disabled="loading"
        />
      </el-form-item>
      <el-form-item label="确认密码">
        <el-input
          v-model="confirmPassword"
          type="password"
          placeholder="请再次输入新密码"
          size="large"
          show-password
          :disabled="loading"
          @keyup.enter="handleReset"
        />
      </el-form-item>
      <el-button
        type="primary"
        size="large"
        :loading="loading"
        class="submit-btn"
        @click="handleReset"
      >
        重置密码
      </el-button>
    </el-form>

    <div class="auth-links">
      <router-link to="/login" class="link">返回登录</router-link>
    </div>
  </div>
</template>

<style scoped>
.forgot-page {
  width: 100%;
}

.code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.code-row .el-input {
  flex: 1;
}

.submit-btn {
  width: 100%;
  margin-top: 8px;
}

.auth-links {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  font-size: var(--momo-font-size-sm);
}
.auth-links .link {
  color: var(--momo-color-brand);
  text-decoration: none;
}
.auth-links .link:hover {
  text-decoration: underline;
}
</style>
