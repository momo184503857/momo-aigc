import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'

/**
 * 服务状态 store（ai-provider 重构后瘦身）。
 *
 * 旧「平台积分 / 个人 Key」全局开关已退役（S4）：是否可生图由模型目录决定
 * （平台渠道或我的渠道任一可用即可）；费用模式随所选模型自动判定
 * （我的渠道模型 = 不扣积分，见 modelCatalog.isMineModel）。
 * 个人渠道余额展示移至「我的渠道」页（仅 toapis 协议渠道）。
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
