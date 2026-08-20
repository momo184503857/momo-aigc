import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'

/**
 * 服务状态 store（fixed-channels 后瘦身）。
 *
 * 渠道全部为平台渠道（管理员配置）：是否可生图由模型目录决定（任一可用生图模型即可），
 * 费用统一按平台定价扣积分（见 modelCatalog.priceFor）。
 */
export const useServerStatusStore = defineStore('serverStatus', () => {
  const catalog = useModelCatalogStore()

  // 当前是否可生图（目录中有任一可用生图模型）
  const canGenerate = computed(() => catalog.hasImageModels)
  const loaded = computed(() => catalog.loaded)

  async function fetchStatus() {
    await catalog.fetchCatalog()
  }

  /** 渠道/模型配置变化后刷新目录（原 refreshKeyConfig 语义） */
  async function refreshKeyConfig() {
    await catalog.refresh()
  }

  return {
    canGenerate,
    loaded,
    fetchStatus,
    refreshKeyConfig,
  }
})
