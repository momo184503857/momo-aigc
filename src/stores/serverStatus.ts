import { defineStore } from 'pinia'
import { ref } from 'vue'
import { toapisProxyApi } from '@/services/toapisProxyApi'

export const useServerStatusStore = defineStore('serverStatus', () => {
  const sharedKeyConfigured = ref(false)
  const loaded = ref(false)

  async function fetchStatus() {
    try {
      const res = await toapisProxyApi.health()
      sharedKeyConfigured.value = res.data.data.sharedKeyConfigured
    } catch {
      sharedKeyConfigured.value = false
    } finally {
      loaded.value = true
    }
  }

  return { sharedKeyConfigured, loaded, fetchStatus }
})
