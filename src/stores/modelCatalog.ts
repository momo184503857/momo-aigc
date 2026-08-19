import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http from '@/services/http'

/**
 * 模型目录 store（ai-provider 重构后前端唯一模型真源，替代原 types/adapter.ts 的
 * MODELS/TEXT_MODELS 硬编码常量）。数据来自 GET /api/models/catalog：
 * 平台渠道组（走积分计费）在前，「我的渠道」组（个人渠道不扣积分）在后。
 */

export interface ModelCapabilities {
  resolutions: string[]
  aspectRatiosByResolution?: Record<string, string[]>
  aspectRatios?: string[]
  maxReferenceImages: number
  maxPromptChars: number
}

export interface CatalogModel {
  /** 渠道模型 id（提交任务用） */
  id: number
  /** 渠道模型名（发给上游的 model 字符串，任务快照存这个） */
  modelId: string
  displayName: string
  logicalCode: string | null
  capabilities: ModelCapabilities | null
  /** 平台模型定价（分辨率→积分）；我的渠道恒 null */
  pricing: Record<string, number> | null
  kind: 'image' | 'text'
  /** 所属渠道 */
  providerId: number
  providerName: string
  adapter: string
  mine: boolean
}

export interface CatalogGroup {
  providerId: number
  providerName: string
  adapter: string
  mine: boolean
  models: CatalogModel[]
}

interface CatalogResponse {
  platform: Array<{ providerId: number; providerName: string; adapter: string; models: any[] }>
  mine: Array<{ providerId: number; providerName: string; adapter: string; models: any[] }>
}

export const useModelCatalogStore = defineStore('modelCatalog', () => {
  const imageGroups = ref<CatalogGroup[]>([])
  const textGroups = ref<CatalogGroup[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  let loadedAt = 0

  function normalize(res: CatalogResponse, kind: 'image' | 'text'): CatalogGroup[] {
    const build = (groups: CatalogResponse['platform'], mine: boolean): CatalogGroup[] =>
      groups
        .map((g) => ({
          providerId: g.providerId,
          providerName: g.providerName,
          adapter: g.adapter,
          mine,
          models: (g.models || []).map((m) => ({
            id: m.id,
            modelId: m.modelId,
            displayName: m.displayName,
            logicalCode: m.logicalCode ?? null,
            capabilities: m.capabilities ?? null,
            pricing: mine ? null : (m.pricing ?? null),
            kind: m.kind ?? kind,
            providerId: g.providerId,
            providerName: g.providerName,
            adapter: g.adapter,
            mine,
          })) as CatalogModel[],
        }))
        .filter((g) => g.models.length > 0)
    return [...build(res.platform, false), ...build(res.mine, true)]
  }

  async function fetchCatalog(force = false): Promise<void> {
    if (loading.value) return
    if (!force && loaded.value && Date.now() - loadedAt < 60_000) return
    loading.value = true
    try {
      const [imgRes, txtRes] = await Promise.all([
        http.get('/models/catalog', { params: { kind: 'image' } }),
        http.get('/models/catalog', { params: { kind: 'text' } }),
      ])
      imageGroups.value = normalize(imgRes.data.data, 'image')
      textGroups.value = normalize(txtRes.data.data, 'text')
      loaded.value = true
      loadedAt = Date.now()
    } catch (e) {
      console.error('[modelCatalog] 拉取模型目录失败:', e)
    } finally {
      loading.value = false
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await fetchCatalog()
  }

  /** 供下拉等场景直接调用（未加载时触发一次拉取） */
  function refresh(): Promise<void> {
    return fetchCatalog(true)
  }

  const flatImageModels = computed<CatalogModel[]>(() => imageGroups.value.flatMap((g) => g.models))
  const flatTextModels = computed<CatalogModel[]>(() => textGroups.value.flatMap((g) => g.models))
  const allModels = computed<CatalogModel[]>(() => [...flatImageModels.value, ...flatTextModels.value])

  const hasImageModels = computed(() => flatImageModels.value.length > 0)
  /** 默认模型：首个平台生图模型（无平台模型时退回首个我的渠道模型） */
  const defaultImageModel = computed<CatalogModel | null>(() => {
    const platform = flatImageModels.value.find((m) => !m.mine)
    return platform ?? flatImageModels.value[0] ?? null
  })
  const defaultTextModel = computed<CatalogModel | null>(() => {
    const platform = flatTextModels.value.find((m) => !m.mine)
    return platform ?? flatTextModels.value[0] ?? null
  })

  function getModel(channelModelId: number | null | undefined): CatalogModel | undefined {
    if (channelModelId === null || channelModelId === undefined) return undefined
    return allModels.value.find((m) => m.id === Number(channelModelId))
  }

  /** 按模型名/逻辑模型 code 反查（旧任务展示名、旧画布节点兼容） */
  function getModelByName(modelName: string): CatalogModel | undefined {
    if (!modelName) return undefined
    return allModels.value.find((m) => m.modelId === modelName || m.logicalCode === modelName)
  }

  /** 展示名兜底：目录查不到（已删/已停用/历史任务）时返回原始字符串 */
  function displayNameFor(modelName: string | null | undefined): string {
    if (!modelName) return ''
    return getModelByName(modelName)?.displayName ?? modelName
  }

  /** 生图模型在指定分辨率下的可用宽高比 */
  function aspectRatiosFor(model: CatalogModel, resolution?: string): string[] {
    const caps = model.capabilities
    if (!caps) return []
    if (resolution && caps.aspectRatiosByResolution?.[resolution]) {
      return caps.aspectRatiosByResolution[resolution]
    }
    return caps.aspectRatios ?? []
  }

  /** 单价（积分）；我的渠道/无定价返回 null（展示「个人渠道 · 不扣积分」） */
  function priceFor(model: CatalogModel | undefined, resolution: string): number | null {
    if (!model || model.mine || !model.pricing) return null
    const price = model.pricing[resolution]
    if (price !== undefined) return price
    const first = model.capabilities?.resolutions?.[0]
    return first !== undefined ? (model.pricing[first] ?? null) : null
  }

  function isMineModel(channelModelId: number | null | undefined): boolean {
    return !!getModel(channelModelId)?.mine
  }

  return {
    imageGroups,
    textGroups,
    loaded,
    loading,
    fetchCatalog,
    ensureLoaded,
    refresh,
    flatImageModels,
    flatTextModels,
    allModels,
    hasImageModels,
    defaultImageModel,
    defaultTextModel,
    getModel,
    getModelByName,
    displayNameFor,
    aspectRatiosFor,
    priceFor,
    isMineModel,
  }
})
