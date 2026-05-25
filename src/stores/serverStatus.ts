import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toapisProxyApi } from '@/services/toapisProxyApi'

export const useServerStatusStore = defineStore('serverStatus', () => {
  const mode = ref<'user' | 'shared'>('user')
  const sharedKeyConfigured = ref(false)
  const loaded = ref(false)

  const isSharedMode = computed(() => mode.value === 'shared')
  const serverHasKey = computed(() => isSharedMode.value && sharedKeyConfigured.value)

  async function fetchStatus() {
    try {
      const res = await toapisProxyApi.health()
      mode.value = res.data.data.mode as 'user' | 'shared'
      sharedKeyConfigured.value = res.data.data.sharedKeyConfigured
    } catch {
      mode.value = 'user'
      sharedKeyConfigured.value = false
    } finally {
      loaded.value = true
    }
  }

  return { mode, sharedKeyConfigured, loaded, isSharedMode, serverHasKey, fetchStatus }
})
