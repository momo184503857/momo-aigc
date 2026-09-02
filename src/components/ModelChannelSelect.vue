<script setup lang="ts">
/**
 * 用户只选择逻辑模型；渠道由服务端按成本自动路由。
 */
import { computed } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import { ceilCreditValue } from '@/types/adapter'

const props = defineProps<{
  /** 逻辑模型 id；0 = 未选中（由宿主负责默认值） */
  modelValue: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'change', model: CatalogModel): void
}>()

const modelCatalog = useModelCatalogStore()

const modelSelectValue = computed({
  get: () => props.modelValue,
  set: (id: number) => {
    const next = modelCatalog.flatImageModels.find((m) => m.id === id)
    if (next) commit(next)
  },
})

function commit(next: CatalogModel) {
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
  if (text === '未定价') return 'is-unknown'
  if (text.includes('免费')) return 'is-free'
  return ''
}
</script>

<template>
  <div class="model-channel-select">
    <el-select
      v-model="modelSelectValue"
      class="mc-select mc-model"
      :placeholder="modelCatalog.loaded ? '选择模型' : '加载中…'"
      :disabled="!modelCatalog.loaded || modelCatalog.flatImageModels.length === 0"
    >
      <el-option v-for="model in modelCatalog.flatImageModels" :key="model.id" :label="model.displayName" :value="model.id">
        <div class="mc-option">
          <span class="mc-option-name">{{ model.displayName }}</span>
          <span class="mc-option-price" :class="priceClass(modelPriceLabel(model))">
            {{ modelPriceLabel(model) }}
          </span>
        </div>
      </el-option>
    </el-select>
  </div>
</template>

<style scoped>
.model-channel-select {
  display: flex;
  align-items: center;
  gap: var(--momo-space-2);
  width: 100%;
}

.mc-model {
  flex: 1;
  min-width: 0;
}

.mc-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--momo-space-2);
  min-width: 0;
}

.mc-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc-option-price {
  flex-shrink: 0;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-price);
  white-space: nowrap;
}

.mc-option-price.is-free {
  color: var(--momo-color-success);
}

.mc-option-price.is-unknown {
  color: var(--momo-color-text-tertiary);
}
</style>
