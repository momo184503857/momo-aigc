import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toapisProxyApi } from '@/services/toapisProxyApi'

export const useServerStatusStore = defineStore('serverStatus', () => {
  const sharedKeyConfigured = ref(false)
  const personalKeyConfigured = ref(false)
  const personalKeyActive = ref(false)
  const loaded = ref(false)

  // 当前是否可用任意一种 key 生图（共享已配 或 个人模式已启用）
  const canGenerate = computed(
    () => sharedKeyConfigured.value || personalKeyActive.value
  )

  // 当前是否在用个人 key（用于隐藏积分价格 / 跳过余额校验）
  const usingPersonalKey = computed(() => personalKeyActive.value)

  async function fetchStatus() {
    try {
      const res = await toapisProxyApi.health()
      const d = res.data.data
      sharedKeyConfigured.value = !!d.sharedKeyConfigured
      personalKeyConfigured.value = !!d.personalKeyConfigured
      personalKeyActive.value = !!d.personalKeyActive
    } catch {
      sharedKeyConfigured.value = false
      personalKeyConfigured.value = false
      personalKeyActive.value = false
    } finally {
      loaded.value = true
    }
  }

  // 用户在设置页保存/切换 key 后调用，同步全局状态
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
    fetchStatus,
    refreshKeyConfig,
  }
})
