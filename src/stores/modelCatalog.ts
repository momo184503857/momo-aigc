import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http from '@/services/http'

/**
 * 模型目录 store（前端唯一模型真源，替代原 types/adapter.ts 的 MODELS/TEXT_MODELS
 * 硬编码常量）。数据来自 GET /api/models/catalog：fixed-channels 后渠道全部为
 * 平台渠道（管理员配置），模型按渠道分组展示，统一按积分计费。
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
  /** 定价（分辨率→积分），ai_models.pricing 单一真源 */
  pricing: Record<string, number> | null
  kind: 'image' | 'text'
  /** 所属渠道 */
  providerId: number
  providerName: string
  adapter: string
}

export interface CatalogGroup {
  providerId: number
  providerName: string
  adapter: string
  models: CatalogModel[]
}

/** 逻辑模型（跨渠道去重后的「模型」维度，供模型+渠道分体选择） */
export interface LogicalImageModel {
  /** 去重 key：logicalCode ?? modelId（无逻辑模型的自定义模型按渠道模型名独立成项） */
  key: string
  /** 展示名（取首条渠道模型的 displayName） */
  label: string
  /** 提供该模型的渠道模型（按目录顺序，价格/能力可不同） */
  channelModels: CatalogModel[]
}

interface CatalogResponse {
  platform: Array<{ providerId: number; providerName: string; adapter: string; models: any[] }>
}

export const useModelCatalogStore = defineStore('modelCatalog', () => {
  const imageGroups = ref<CatalogGroup[]>([])
  const textGroups = ref<CatalogGroup[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  let loadedAt = 0

  function normalize(res: CatalogResponse, kind: 'image' | 'text'): CatalogGroup[] {
    return (res.platform || [])
      .map((g) => ({
        providerId: g.providerId,
        providerName: g.providerName,
        adapter: g.adapter,
        models: (g.models || []).map((m) => ({
          id: m.id,
          modelId: m.modelId,
          displayName: m.displayName,
          logicalCode: m.logicalCode ?? null,
          capabilities: m.capabilities ?? null,
          pricing: m.pricing ?? null,
          kind: m.kind ?? kind,
          providerId: g.providerId,
          providerName: g.providerName,
          adapter: g.adapter,
        })) as CatalogModel[],
      }))
      .filter((g) => g.models.length > 0)
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
  /** 默认模型：目录第一个可用模型 */
  const defaultImageModel = computed<CatalogModel | null>(() => flatImageModels.value[0] ?? null)
  const defaultTextModel = computed<CatalogModel | null>(() => flatTextModels.value[0] ?? null)

  /** 生图模型按逻辑模型去重（「模型+渠道」分体选择的模型维度，Map 保持目录首现顺序） */
  const imageLogicalModels = computed<LogicalImageModel[]>(() => {
    const map = new Map<string, LogicalImageModel>()
    for (const m of flatImageModels.value) {
      const key = m.logicalCode ?? m.modelId
      const existing = map.get(key)
      if (existing) existing.channelModels.push(m)
      else map.set(key, { key, label: m.displayName, channelModels: [m] })
    }
    return [...map.values()]
  })

  function getModel(channelModelId: number | null | undefined): CatalogModel | undefined {
    if (channelModelId === null || channelModelId === undefined) return undefined
    return allModels.value.find((m) => m.id === Number(channelModelId))
  }

  /** channelModelId 反查所属逻辑模型（模型+渠道分体选择时派生两级选中态） */
  function logicalModelFor(channelModelId: number | null | undefined): LogicalImageModel | undefined {
    if (channelModelId === null || channelModelId === undefined) return undefined
    const id = Number(channelModelId)
    return imageLogicalModels.value.find((lm) => lm.channelModels.some((m) => m.id === id))
  }

  /** 一组渠道模型的最低单价（积分，各分辨率取最小）；全部无定价返回 null */
  function minPriceOf(models: CatalogModel[]): number | null {
    let min: number | null = null
    for (const m of models) {
      if (!m.pricing) continue
      for (const v of Object.values(m.pricing)) {
        if (typeof v === 'number' && Number.isFinite(v) && (min === null || v < min)) min = v
      }
    }
    return min
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

  /** 单价（积分）；无定价返回 null（展示时提示请联系管理员配置） */
  function priceFor(model: CatalogModel | undefined, resolution: string): number | null {
    if (!model || !model.pricing) return null
    const price = model.pricing[resolution]
    if (price !== undefined) return price
    const first = model.capabilities?.resolutions?.[0]
    return first !== undefined ? (model.pricing[first] ?? null) : null
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
    imageLogicalModels,
    getModel,
    getModelByName,
    logicalModelFor,
    minPriceOf,
    displayNameFor,
    aspectRatiosFor,
    priceFor,
  }
})
