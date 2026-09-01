<script setup lang="ts">
/**
 * ModelChannelSelect - 模型 + 渠道分体选择器
 *
 * 模型 = 逻辑模型（跨渠道去重，按目录首现顺序）；渠道 = 提供该模型的渠道，
 * 各渠道定价/能力可不同。两级联动后定位到唯一渠道模型（channelModelId），
 * 对外 v-model 仍是 channelModelId，提交链路与各表单 handleModelChange 不变。
 * 下拉选项内显示价格：模型维度 = 各渠道最低单价（“0.084 起”），
 * 渠道维度 = 完整价目（“1K 0.105 · 2K 0.14 · 4K 0.175”）。
 */
import { computed } from 'vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'

const props = defineProps<{
  /** 渠道模型 id（ai_models.id，提交任务用）；0 = 未选中（由宿主负责默认值） */
  modelValue: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'change', model: CatalogModel): void
}>()

const modelCatalog = useModelCatalogStore()

const logicalOptions = computed(() => modelCatalog.imageLogicalModels)

const selectedModel = computed(() => modelCatalog.getModel(props.modelValue))
const selectedLogical = computed(() => modelCatalog.logicalModelFor(props.modelValue))
const channelOptions = computed(() => selectedLogical.value?.channelModels ?? [])

const modelSelectValue = computed({
  get: () => selectedLogical.value?.key ?? '',
  set: (key: string) => {
    const target = logicalOptions.value.find((l) => l.key === key)
    if (!target) return
    // 切模型时保持当前渠道（若该渠道提供此模型），否则取第一个渠道
    const keep = selectedModel.value
      ? target.channelModels.find((m) => m.providerId === selectedModel.value!.providerId)
      : undefined
    const next = keep ?? target.channelModels[0]
    if (next) commit(next)
  },
})

const channelSelectValue = computed({
  get: () => props.modelValue,
  set: (id: number) => {
    const next = channelOptions.value.find((m) => m.id === id)
    if (next) commit(next)
  },
})

function commit(next: CatalogModel) {
  emit('update:modelValue', next.id)
  emit('change', next)
}

/** 同一渠道挂多条渠道模型时用 modelId 区分展示 */
function channelLabel(m: CatalogModel): string {
  const dup = channelOptions.value.filter((x) => x.providerId === m.providerId).length > 1
  return dup ? `${m.providerName}（${m.modelId}）` : m.providerName
}

function fmtPrice(v: number): string {
  return v === 0 ? '免费' : v.toFixed(3)
}

/** 模型维度价格：各渠道各分辨率最低单价 */
function modelPriceLabel(models: CatalogModel[]): string {
  const min = modelCatalog.minPriceOf(models)
  if (min === null) return '未定价'
  return `${fmtPrice(min)}起`
}

/** 渠道维度价格：按分辨率顺序的完整价目 */
function channelPriceLabel(m: CatalogModel): string {
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
      :disabled="!modelCatalog.loaded || logicalOptions.length === 0"
    >
      <el-option v-for="lm in logicalOptions" :key="lm.key" :label="lm.label" :value="lm.key">
        <div class="mc-option">
          <span class="mc-option-name">{{ lm.label }}</span>
          <span class="mc-option-price" :class="priceClass(modelPriceLabel(lm.channelModels))">
            {{ modelPriceLabel(lm.channelModels) }}
          </span>
        </div>
      </el-option>
    </el-select>
    <el-select
      v-model="channelSelectValue"
      class="mc-select mc-channel"
      :placeholder="selectedLogical ? '选择渠道' : '先选模型'"
      :disabled="!selectedLogical || channelOptions.length === 0"
    >
      <el-option v-for="m in channelOptions" :key="m.id" :label="channelLabel(m)" :value="m.id">
        <div class="mc-option">
          <span class="mc-option-name">{{ channelLabel(m) }}</span>
          <span class="mc-option-price" :class="priceClass(channelPriceLabel(m))">
            {{ channelPriceLabel(m) }}
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

/* 渠道价目文本较长（如 “1K 0.105 · 2K 0.14 · 4K 0.175”），占比略大 */
.mc-model {
  flex: 1;
  min-width: 0;
}

.mc-channel {
  flex: 1.3;
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
