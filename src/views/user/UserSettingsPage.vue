<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/services/authApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useCodeCountdown } from '@/composables/useCodeCountdown'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'UserSettings' })

const auth = useAuthStore()
const { success, warning, error } = useUiFeedback()

// ── 修改昵称 ──
const nickname = ref(auth.user?.nickname || '')
const nicknameLoading = ref(false)

async function handleUpdateNickname() {
  if (!nickname.value.trim()) { warning('请输入昵称'); return }
  nicknameLoading.value = true
  try {
    await authApi.updateProfile(nickname.value)
    // 同步更新 store 里的 user
    if (auth.user) auth.user.nickname = nickname.value.trim()
    success('昵称已更新')
  } catch (e: any) {
    error(e.response?.data?.error || '更新失败')
  } finally {
    nicknameLoading.value = false
  }
}

// ── 绑定邮箱 ──
const bindEmail = ref('')
const bindCode = ref('')
const bindLoading = ref(false)
const { countdown: bindCountdown, sendCustom: sendBindCode } = useCodeCountdown()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function handleSendBindCode() {
  if (!bindEmail.value) { warning('请输入邮箱'); return }
  if (!EMAIL_RE.test(bindEmail.value)) { warning('邮箱格式不正确'); return }
  await sendBindCode(bindEmail.value, (email) => authApi.sendBindCode(email))
}

async function handleBindEmail() {
  if (!bindEmail.value || !bindCode.value) { warning('请填写邮箱和验证码'); return }
  bindLoading.value = true
  try {
    await authApi.bindEmail(bindEmail.value, bindCode.value)
    if (auth.user) auth.user.email = bindEmail.value
    success('邮箱绑定成功')
    bindEmail.value = ''
    bindCode.value = ''
  } catch (e: any) {
    error(e.response?.data?.error || '绑定失败')
  } finally {
    bindLoading.value = false
  }
}

// ── 修改密码 ──
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)

async function handleChangePassword() {
  if (!oldPassword.value || !newPassword.value) { warning('请输入旧密码和新密码'); return }
  if (newPassword.value.length < 6) { warning('新密码至少6位'); return }
  if (newPassword.value !== confirmPassword.value) { warning('两次密码不一致'); return }

  passwordLoading.value = true
  try {
    await authApi.updatePassword(oldPassword.value, newPassword.value)
    success('密码已修改')
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e: any) {
    error(e.response?.data?.error || '修改失败')
  } finally {
    passwordLoading.value = false
  }
}
</script>

<template>
  <PageLayout>
    <template #header><h2>个人设置</h2></template>

    <!-- 账号信息 -->
    <div class="settings-card">
      <h3 class="card-title">账号信息</h3>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="昵称">
          {{ auth.user?.nickname || auth.user?.username || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="邮箱">
          {{ auth.user?.email || '未绑定' }}
        </el-descriptions-item>
        <el-descriptions-item label="用户名">
          {{ auth.user?.username }}
        </el-descriptions-item>
        <el-descriptions-item label="角色">
          <el-tag :type="auth.isAdmin ? 'danger' : 'info'" size="small">
            {{ auth.isAdmin ? '管理员' : '用户' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </div>

    <!-- 绑定邮箱（仅未绑定时显示） -->
    <div v-if="!auth.user?.email" class="settings-card">
      <h3 class="card-title">绑定邮箱</h3>
      <p class="card-desc">绑定后可用邮箱登录和接收验证码。</p>
      <el-form label-position="top" class="settings-form">
        <el-form-item label="邮箱">
          <el-input
            v-model="bindEmail"
            placeholder="请输入邮箱"
            :disabled="bindLoading"
          />
        </el-form-item>
        <el-form-item label="验证码">
          <div class="code-row">
            <el-input
              v-model="bindCode"
              placeholder="请输入验证码"
              :disabled="bindLoading"
            />
            <el-button
              :disabled="bindCountdown > 0 || bindLoading"
              @click="handleSendBindCode"
            >
              {{ bindCountdown > 0 ? `${bindCountdown}s` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>
        <el-button
          type="primary"
          :loading="bindLoading"
          @click="handleBindEmail"
        >
          绑定邮箱
        </el-button>
      </el-form>
    </div>

    <!-- 修改昵称 -->
    <div class="settings-card">
      <h3 class="card-title">修改昵称</h3>
      <el-form label-position="top" class="settings-form">
        <el-form-item label="新昵称">
          <el-input
            v-model="nickname"
            placeholder="请输入新昵称"
            maxlength="32"
            show-word-limit
            :disabled="nicknameLoading"
          />
        </el-form-item>
        <el-button
          type="primary"
          :loading="nicknameLoading"
          @click="handleUpdateNickname"
        >
          保存
        </el-button>
      </el-form>
    </div>

    <!-- 修改密码 -->
    <div class="settings-card">
      <h3 class="card-title">修改密码</h3>
      <el-form label-position="top" class="settings-form">
        <el-form-item label="旧密码">
          <el-input
            v-model="oldPassword"
            type="password"
            placeholder="请输入旧密码"
            show-password
            :disabled="passwordLoading"
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="newPassword"
            type="password"
            placeholder="至少6位"
            show-password
            :disabled="passwordLoading"
          />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input
            v-model="confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
            :disabled="passwordLoading"
            @keyup.enter="handleChangePassword"
          />
        </el-form-item>
        <el-button
          type="primary"
          :loading="passwordLoading"
          @click="handleChangePassword"
        >
          修改密码
        </el-button>
      </el-form>
    </div>
  </PageLayout>
</template>

<style scoped>
.settings-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  padding: var(--momo-space-6, 24px);
  margin-bottom: var(--momo-space-5, 20px);
}
.card-title {
  margin: 0 0 var(--momo-space-4, 16px);
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.card-desc {
  margin: 0 0 var(--momo-space-4, 16px);
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}
.settings-form {
  max-width: 420px;
}
.settings-form .el-button {
  margin-top: 8px;
}
.code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.code-row .el-input {
  flex: 1;
}
</style>
