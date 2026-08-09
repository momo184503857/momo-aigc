import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { toapisProxyApi } from '@/services/toapisProxyApi'
import { userKeyApi } from '@/services/userKeyApi'

export const useServerStatusStore = defineStore('serverStatus', () => {
  const sharedKeyConfigured = ref(false)
  const personalKeyConfigured = ref(false)
  const personalKeyActive = ref(false)
  const loaded = ref(false)

  // 个人 Key 余额轮询（全局，头像与「我的额度」共享）
  const personalKeyCredits = ref<number | null>(null)
  const personalKeyBalanceAt = ref<number | null>(null) // 上次刷新时间戳(ms)
  const personalKeyBalanceError = ref<string | null>(null)
  const balanceCheckIntervalSec = ref<number>(60) // 0 = 不查询
  const balanceRefreshing = ref(false)

  // 当前是否可用任意一种 key 生图（共享已配 或 个人模式已启用）
  const canGenerate = computed(
    () => sharedKeyConfigured.value || personalKeyActive.value
  )

  // 当前是否在用个人 key（用于隐藏积分价格 / 跳过余额校验）
  const usingPersonalKey = computed(() => personalKeyActive.value)

  // 拉取一次个人 Key 余额（幂等；轮询器、手动按钮、模式激活共用）
  async function refreshPersonalBalance() {
    if (!personalKeyActive.value) {
      personalKeyCredits.value = null
      personalKeyBalanceError.value = null
      return
    }
    balanceRefreshing.value = true
    try {
      const res = await userKeyApi.getBalance()
      if (res.data.success) {
        personalKeyCredits.value = res.data.data.credits
        personalKeyBalanceError.value = null
      } else {
        personalKeyCredits.value = null
        personalKeyBalanceError.value = res.data.error || '查询余额失败'
      }
    } catch (e: any) {
      personalKeyCredits.value = null
      personalKeyBalanceError.value = e.response?.data?.error || e.message
    } finally {
      personalKeyBalanceAt.value = Date.now()
      balanceRefreshing.value = false
    }
  }

  // 轮询定时器：仅随 [personalKeyActive, balanceCheckIntervalSec] 变化而重新装填
  let pollTimer: ReturnType<typeof setInterval> | null = null
  function stopPoller() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
  watch(
    [personalKeyActive, balanceCheckIntervalSec],
    ([active, interval]) => {
      stopPoller()
      if (!active) {
        personalKeyCredits.value = null
        personalKeyBalanceError.value = null
        return
      }
      // 进入个人模式：先拉一次基线值
      refreshPersonalBalance()
      // interval > 0 才按间隔轮询；0 = 不查询（仅手动）
      if (interval > 0) {
        pollTimer = setInterval(refreshPersonalBalance, interval * 1000)
      }
    },
  )

  async function fetchStatus() {
    try {
      const res = await toapisProxyApi.health()
      const d = res.data.data
      sharedKeyConfigured.value = !!d.sharedKeyConfigured
      personalKeyConfigured.value = !!d.personalKeyConfigured
      personalKeyActive.value = !!d.personalKeyActive
      balanceCheckIntervalSec.value =
        typeof d.balanceCheckIntervalSec === 'number' ? d.balanceCheckIntervalSec : 60
    } catch {
      // health 请求偶发失败时，保留上一次已知状态（避免已切换的模式被误清零弹回）。
      // 首次加载（loaded=false）且拉取失败时，才退守到“无可用 key”，保证生图按钮有合理初始态。
      if (!loaded.value) {
        sharedKeyConfigured.value = false
        personalKeyConfigured.value = false
        personalKeyActive.value = false
      }
    } finally {
      loaded.value = true
    }
  }

  // 用户在「我的额度」保存/切换 key 或改间隔后调用，同步全局状态
  async function refreshKeyConfig() {
    await fetchStatus()
  }

  return {
    sharedKeyConfigured,
    personalKeyConfigured,
    personalKeyActive,
    canGenerate,
    usingPersonalKey,
    loaded,
    // 个人 Key 余额轮询
    personalKeyCredits,
    personalKeyBalanceAt,
    personalKeyBalanceError,
    balanceCheckIntervalSec,
    balanceRefreshing,
    fetchStatus,
    refreshKeyConfig,
    refreshPersonalBalance,
  }
})
