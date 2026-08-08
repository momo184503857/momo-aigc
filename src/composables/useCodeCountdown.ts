import { ref, onUnmounted } from 'vue'
import { authApi, type CodePurpose } from '@/services/authApi'
import { useUiFeedback } from './useUiFeedback'

/**
 * 验证码发送 + 倒计时逻辑。
 * 返回 send 函数（传入邮箱 + 用途）和剩余秒数。
 */
export function useCodeCountdown() {
  const { success, error } = useUiFeedback()
  const countdown = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  function start(seconds: number) {
    countdown.value = seconds
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        countdown.value = 0
        if (timer) { clearInterval(timer); timer = null }
      }
    }, 1000)
  }

  async function send(email: string, purpose: CodePurpose): Promise<boolean> {
    if (countdown.value > 0) return false
    try {
      await authApi.sendCode(email, purpose)
      success('验证码已发送，请查收邮箱')
      start(60)
      return true
    } catch (e: any) {
      error(e.response?.data?.error || '验证码发送失败')
      return false
    }
  }

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { countdown, send }
}
