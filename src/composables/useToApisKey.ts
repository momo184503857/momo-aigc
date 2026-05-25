import { useKeyConfigStore } from '@/stores/keyConfig'

export function useToApisKey() {
  const store = useKeyConfigStore()

  function checkKeyOrWarn(): boolean {
    if (!store.hasKey) {
      return false
    }
    return true
  }

  return {
    apiKey: store.apiKey,
    hasKey: store.hasKey,
    maskedKey: store.maskedKey,
    saveKey: store.saveKey,
    deleteKey: store.deleteKey,
    checkKeyOrWarn,
  }
}
