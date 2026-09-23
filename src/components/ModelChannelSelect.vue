<script setup lang="ts">
/**
 * 用户只选择逻辑模型；渠道由服务端按成本自动路由。
 */
import { computed, useAttrs } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import { ceilCreditValue } from '@/types/adapter'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /** 逻辑模型 id；0 = 未选中（由宿主负责默认值） */
  modelValue: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'change', model: CatalogModel): void
}>()

const modelCatalog = useModelCatalogStore()
const attrs = useAttrs()

const selectedModel = computed(() =>
  modelCatalog.flatImageModels.find((m) => m.id === props.modelValue),
)

function onSelect(value: string) {
  const next = modelCatalog.flatImageModels.find((m) => m.id === Number(value))
  if (!next) return
  emit('update:modelValue', next.id)
  emit('change', next)
}

function fmtPrice(v: number): string {
  return v === 0 ? '免费' : ceilCreditValue(v).toFixed(2)
}

/** 逻辑模型统一售价 */
function modelPriceLabel(m: CatalogModel): string {
  if (!m.pricing) return '未定价'
  const keys = (m.capabilities?.resolutions ?? Object.keys(m.pricing)).filter(
    (r) => m.pricing![r] !== undefined,
  )
  if (keys.length === 0) return '未定价'
  return keys.map((r) => `${r} ${fmtPrice(m.pricing![r])}`).join(' · ')
}

function priceClass(text: string): string {
  if (text === '未定价') return 'text-muted-foreground'
  if (text.includes('免费')) return 'text-success'
  return 'text-(--momo-color-price)'
}
</script>

<template>
  <Select
    :model-value="modelValue ? String(modelValue) : ''"
    :disabled="!modelCatalog.loaded || modelCatalog.flatImageModels.length === 0"
    @update:model-value="onSelect(String($event))"
  >
    <SelectTrigger class="w-full" :class="attrs.class">
      <span class="flex-1 truncate text-left">
        {{ selectedModel?.displayName ?? (modelCatalog.loaded ? '选择模型' : '加载中…') }}
      </span>
    </SelectTrigger>
    <SelectContent>
      <SelectItem
        v-for="model in modelCatalog.flatImageModels"
        :key="model.id"
        :value="String(model.id)"
      >
        <span class="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span class="truncate">{{ model.displayName }}</span>
          <span class="shrink-0 text-xs whitespace-nowrap" :class="priceClass(modelPriceLabel(model))">
            {{ modelPriceLabel(model) }}
          </span>
        </span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
