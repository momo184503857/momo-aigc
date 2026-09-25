import { computed } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { ceilCreditValue } from '@/types/adapter'
/** 业务目录适配层：公共 UI 只接收选项，不访问 store、接口或计费逻辑。 */
export function useGenerationModelOptions() {
  const catalog = useModelCatalogStore()
  return computed(() => catalog.flatImageModels.map(model => {
    const resolutions = (model.capabilities?.resolutions ?? Object.keys(model.pricing || {})).filter(r => model.pricing?.[r] !== undefined)
    const description = !resolutions.length ? '未定价' : resolutions.map(r => {
      const price = model.pricing![r]!
      return `${r} ${price === 0 ? '免费' : ceilCreditValue(price).toFixed(2)}`
    }).join(' · ')
    return { value: model.id, label: model.displayName, description }
  }))
}
