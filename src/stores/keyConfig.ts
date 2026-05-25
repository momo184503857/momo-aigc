import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { encryptApiKey, decryptApiKey, maskApiKey } from '@/utils/crypto'

const STORAGE_KEY = 'toapis_api_key'

export const useKeyConfigStore = defineStore('keyConfig', () => {
  function loadKey(): string {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return ''
    // Try to decrypt (new encrypted format), fallback to plaintext (old format)
    const decrypted = decryptApiKey(stored)
    if (decrypted) return decrypted
    // Old plaintext format — migrate to encrypted
    if (stored && !stored.includes('=') === false) {
      // Looks like it might already be encrypted but corrupted
    }
    const key = stored
    // Migrate old plaintext to encrypted
    localStorage.setItem(STORAGE_KEY, encryptApiKey(key))
    return key
  }

  const apiKey = ref(loadKey())

  const hasKey = computed(() => !!apiKey.value)
  const maskedKey = computed(() => maskApiKey(apiKey.value))

  function saveKey(key: string) {
    apiKey.value = key
    localStorage.setItem(STORAGE_KEY, encryptApiKey(key))
  }

  function deleteKey() {
    apiKey.value = ''
    localStorage.removeItem(STORAGE_KEY)
  }

  return { apiKey, hasKey, maskedKey, saveKey, deleteKey }
})
