import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'toapis_api_key'

export const useKeyConfigStore = defineStore('keyConfig', () => {
  const apiKey = ref(localStorage.getItem(STORAGE_KEY) || '')

  const hasKey = computed(() => !!apiKey.value)
  const maskedKey = computed(() => {
    if (!apiKey.value) return ''
    if (apiKey.value.length <= 8) return '***'
    return apiKey.value.slice(0, 4) + '****' + apiKey.value.slice(-4)
  })

  function saveKey(key: string) {
    apiKey.value = key
    localStorage.setItem(STORAGE_KEY, key)
  }

  function deleteKey() {
    apiKey.value = ''
    localStorage.removeItem(STORAGE_KEY)
  }

  return { apiKey, hasKey, maskedKey, saveKey, deleteKey }
})
