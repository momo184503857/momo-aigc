<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
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
const { countdown, send } = useCodeCountdown()

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
  <div class="login-page">
    <el-tabs v-model="activeTab" class="login-tabs">
      <el-tab-pane label="密码登录" name="password">
        <el-form @submit.prevent="handlePasswordLogin" label-position="top">
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
              @keyup.enter="handlePasswordLogin"
            />
          </el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="submit-btn"
            @click="handlePasswordLogin"
          >
            登录
          </el-button>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="验证码登录" name="code">
        <el-form @submit.prevent="handleCodeLogin" label-position="top">
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
                @keyup.enter="handleCodeLogin"
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
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="submit-btn"
            @click="handleCodeLogin"
          >
            登录
          </el-button>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <div class="auth-links">
      <router-link to="/forgot-password" class="link">忘记密码？</router-link>
      <router-link to="/register" class="link">注册账号</router-link>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
}

.login-tabs {
  --el-color-primary: var(--momo-color-brand);
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
  justify-content: space-between;
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
