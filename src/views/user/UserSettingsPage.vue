<script setup lang="ts">
import { ref, computed } from 'vue'
import { CircleCheck, Eye, EyeOff, Key, LoaderCircle, ShieldCheck, TriangleAlert, User } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/services/authApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useCodeCountdown } from '@/composables/useCodeCountdown'
import PageLayout from '@/components/PageLayout.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

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

// 纯 UI：密码可见性切换（原 EP 输入框 show-password）
const showOldPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

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

/* ─────────────────────────────────────────────
   以下为纯视图层派生状态：只读地把已有的校验条件显性化，
   不参与任何请求 / 提交判定（提交逻辑仍由上面三个 handler 负责）。
   ───────────────────────────────────────────── */

const emailBound = computed(() => !!auth.user?.email)

/** 头像占位字符：昵称/用户名首字符，避免引入额外头像资源 */
const avatarInitial = computed(() =>
  (auth.user?.nickname || auth.user?.username || '?').trim().charAt(0).toUpperCase(),
)

/** 昵称是否有未保存的改动（仅提示，不拦截保存） */
const nicknameDirty = computed(
  () => nickname.value.trim() !== (auth.user?.nickname || '') && !!nickname.value.trim(),
)

/** 密码表单还差什么；空串代表各项均已填写 */
const passwordHint = computed(() => {
  if (!oldPassword.value) return '请输入旧密码'
  if (!newPassword.value) return '请输入新密码'
  if (newPassword.value.length < 6) return '新密码至少 6 位'
  if (!confirmPassword.value) return '请再次输入新密码'
  if (newPassword.value !== confirmPassword.value) return '两次输入的密码不一致'
  return ''
})

/** 两次密码已不一致时才升级为强警示 */
const passwordMismatch = computed(
  () => !!newPassword.value && !!confirmPassword.value && newPassword.value !== confirmPassword.value,
)

type PasswordFieldType = 'old' | 'new' | 'confirm'

/** 密码字段的可见性开关映射，替代三选一模板的 v-if 分支 */
const passwordRevealed = computed<Record<PasswordFieldType, boolean>>(() => ({
  old: showOldPassword.value,
  new: showNewPassword.value,
  confirm: showConfirmPassword.value,
}))

function togglePasswordReveal(field: PasswordFieldType) {
  if (field === 'old') showOldPassword.value = !showOldPassword.value
  else if (field === 'new') showNewPassword.value = !showNewPassword.value
  else showConfirmPassword.value = !showConfirmPassword.value
}
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>个人设置</h2>
      <p class="text-muted-foreground mt-1 text-[13px]">
        修改账号显示名称、绑定登录邮箱、更换密码。
      </p>
    </template>

    <template #extra>
      <Badge :variant="emailBound ? 'success' : 'warning'" class="gap-1">
        <CircleCheck v-if="emailBound" />
        <TriangleAlert v-else />
        {{ emailBound ? '邮箱已绑定' : '邮箱未绑定' }}
      </Badge>
    </template>

    <!-- 左：身份概览（只读，降权）｜右：三件真正可改的事 -->
    <div class="mx-auto grid w-full max-w-5xl gap-x-10 gap-y-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <!-- ════ 账号概览：吸收原「账号信息」四行表格 ════ -->
      <aside class="min-w-0 self-start lg:sticky lg:top-0">
        <div class="flex items-center gap-3">
          <span
            class="bg-primary/10 text-primary grid size-11 shrink-0 select-none place-items-center rounded-full text-base font-semibold"
            aria-hidden="true"
          >
            {{ avatarInitial }}
          </span>
          <div class="min-w-0">
            <p class="truncate text-[15px] leading-tight font-semibold">
              {{ auth.user?.nickname || auth.user?.username || '未设置' }}
            </p>
            <p class="text-muted-foreground mt-0.5 truncate text-[12px]">
              @{{ auth.user?.username }}
            </p>
          </div>
        </div>

        <dl class="mt-5 space-y-2 text-[13px]">
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-muted-foreground shrink-0">用户名</dt>
            <dd class="min-w-0 truncate font-medium">{{ auth.user?.username }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-muted-foreground shrink-0">角色</dt>
            <dd>
              <Badge :variant="auth.isAdmin ? 'destructive' : 'secondary'">
                {{ auth.isAdmin ? '管理员' : '用户' }}
              </Badge>
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-muted-foreground shrink-0">邮箱</dt>
            <dd class="min-w-0 truncate" :class="auth.user?.email ? 'font-medium' : 'text-muted-foreground'">
              {{ auth.user?.email || '未绑定' }}
            </dd>
          </div>
        </dl>

        <p class="text-muted-foreground/80 mt-4 text-[12px] leading-5">
          用户名与角色由平台维护，不可自行修改。
        </p>
      </aside>

      <!-- ════ 可编辑分组 ════ -->
      <div class="min-w-0">
        <!-- ── 昵称 ── -->
        <section class="pt-0.5 pb-6">
          <div class="mb-3.5 flex items-center gap-2">
            <User class="text-muted-foreground size-3.5 shrink-0" />
            <h3 class="text-[13px] font-semibold">昵称</h3>
            <p class="text-muted-foreground min-w-0 flex-1 truncate text-[12px]">
              展示在工作台中
            </p>
          </div>

          <div class="grid items-start gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4">
            <Label for="nickname" class="text-muted-foreground pt-2 text-[13px] font-normal">
              显示名称
            </Label>
            <div class="flex flex-wrap items-center gap-2">
              <Input
                id="nickname"
                v-model="nickname"
                placeholder="请输入新昵称"
                maxlength="32"
                class="max-w-64"
                :disabled="nicknameLoading"
              />
              <Button :disabled="nicknameLoading" @click="handleUpdateNickname">
                <LoaderCircle v-if="nicknameLoading" class="animate-spin" />
                保存
              </Button>
              <span class="text-muted-foreground text-[12px] tabular-nums">
                {{ nickname.length }}/32
              </span>
              <span v-if="nicknameDirty" class="text-warning text-[12px]">未保存</span>
            </div>
          </div>
        </section>

        <Separator />

        <!-- ── 绑定邮箱（仅未绑定时出现） ── -->
        <section v-if="!emailBound" class="py-6">
          <div class="mb-3.5 flex items-center gap-2">
            <ShieldCheck class="text-muted-foreground size-3.5 shrink-0" />
            <h3 class="text-[13px] font-semibold">绑定邮箱</h3>
            <p class="text-muted-foreground min-w-0 flex-1 truncate text-[12px]">
              绑定后可用邮箱登录和接收验证码
            </p>
          </div>

          <div class="grid items-start gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4">
            <Label for="bind-email" class="text-muted-foreground pt-2 text-[13px] font-normal">
              邮箱
            </Label>
            <div class="flex flex-wrap items-center gap-2">
              <Input
                id="bind-email"
                v-model="bindEmail"
                placeholder="请输入邮箱"
                class="max-w-64"
                :disabled="bindLoading"
              />
              <Button
                type="button"
                variant="outline"
                class="shrink-0"
                :disabled="bindCountdown > 0 || bindLoading"
                @click="handleSendBindCode"
              >
                {{ bindCountdown > 0 ? `${bindCountdown}s` : '获取验证码' }}
              </Button>
            </div>

            <Label for="bind-code" class="text-muted-foreground pt-2 text-[13px] font-normal">
              验证码
            </Label>
            <div class="flex flex-wrap items-center gap-2">
              <Input
                id="bind-code"
                v-model="bindCode"
                placeholder="请输入验证码"
                class="max-w-64"
                :disabled="bindLoading"
              />
              <Button :disabled="bindLoading" @click="handleBindEmail">
                <LoaderCircle v-if="bindLoading" class="animate-spin" />
                绑定邮箱
              </Button>
            </div>
          </div>
        </section>

        <Separator v-if="!emailBound" />

        <!-- ── 修改密码 ── -->
        <section class="pt-6 pb-2">
          <div class="mb-3.5 flex items-center gap-2">
            <Key class="text-muted-foreground size-3.5 shrink-0" />
            <h3 class="text-[13px] font-semibold">修改密码</h3>
            <p class="text-muted-foreground min-w-0 flex-1 truncate text-[12px]">
              新密码至少 6 位，修改后需重新登录
            </p>
          </div>

          <div class="grid items-start gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4">
            <span class="text-muted-foreground pt-2 text-[13px] font-normal">密码</span>
            <div class="grid gap-3 sm:grid-cols-2 xl:max-w-xl">
              <!-- 旧密码 -->
              <div class="grid content-start gap-1">
                <Label for="old-password" class="text-[12px] font-normal">旧密码</Label>
                <div class="relative">
                  <Input
                    id="old-password"
                    v-model="oldPassword"
                    :type="passwordRevealed.old ? 'text' : 'password'"
                    placeholder="请输入旧密码"
                    class="pr-9"
                    :disabled="passwordLoading"
                  />
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
                    :title="passwordRevealed.old ? '隐藏密码' : '显示密码'"
                    @click="togglePasswordReveal('old')"
                  >
                    <EyeOff v-if="passwordRevealed.old" class="size-4" />
                    <Eye v-else class="size-4" />
                  </button>
                </div>
              </div>

              <!-- 新密码 -->
              <div class="grid content-start gap-1">
                <Label for="new-password" class="text-[12px] font-normal">新密码</Label>
                <div class="relative">
                  <Input
                    id="new-password"
                    v-model="newPassword"
                    :type="passwordRevealed.new ? 'text' : 'password'"
                    placeholder="至少6位"
                    class="pr-9"
                    :disabled="passwordLoading"
                  />
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
                    :title="passwordRevealed.new ? '隐藏密码' : '显示密码'"
                    @click="togglePasswordReveal('new')"
                  >
                    <EyeOff v-if="passwordRevealed.new" class="size-4" />
                    <Eye v-else class="size-4" />
                  </button>
                </div>
              </div>

              <!-- 确认新密码 -->
              <div class="grid content-start gap-1">
                <Label for="confirm-password" class="text-[12px] font-normal">确认新密码</Label>
                <div class="relative">
                  <Input
                    id="confirm-password"
                    v-model="confirmPassword"
                    :type="passwordRevealed.confirm ? 'text' : 'password'"
                    placeholder="请再次输入新密码"
                    class="pr-9"
                    :disabled="passwordLoading"
                    @keyup.enter="handleChangePassword"
                  />
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
                    :title="passwordRevealed.confirm ? '隐藏密码' : '显示密码'"
                    @click="togglePasswordReveal('confirm')"
                  >
                    <EyeOff v-if="passwordRevealed.confirm" class="size-4" />
                    <Eye v-else class="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 sm:pl-[8.5rem]">
            <Button :disabled="passwordLoading" @click="handleChangePassword">
              <LoaderCircle v-if="passwordLoading" class="animate-spin" />
              修改密码
            </Button>
            <span
              v-if="passwordHint"
              class="text-[12px]"
              :class="passwordMismatch ? 'text-destructive' : 'text-muted-foreground'"
            >
              {{ passwordHint }}
            </span>
          </div>
        </section>
      </div>
    </div>
  </PageLayout>
</template>
