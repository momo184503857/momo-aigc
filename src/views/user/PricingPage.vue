<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ceilCreditValue } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'Pricing' })
const modelCatalog = useModelCatalogStore()
onMounted(() => modelCatalog.ensureLoaded())

const RESOLUTION_SIZE: Record<string, number> = { '512': 512, '1K': 1024, '2K': 2048, '4K': 4096 }

const resolutionColumns = computed(() => {
  const set = new Set<string>()
  for (const model of modelCatalog.flatImageModels) {
    for (const r of model.capabilities?.resolutions ?? []) set.add(r)
  }
  return [...set].sort((a, b) => (RESOLUTION_SIZE[a] ?? Infinity) - (RESOLUTION_SIZE[b] ?? Infinity))
})

const rows = computed(() => modelCatalog.flatImageModels.map((model) => ({
  key: model.id,
  model: model.displayName,
  prices: Object.fromEntries(
    resolutionColumns.value.map((r) => [r, model.pricing?.[r] ?? null]),
  ) as Record<string, number | null>,
})))

function fmt(value: number): string {
  return ceilCreditValue(value, 2).toFixed(2)
}
</script>

<template>
  <PageLayout>
    <template #header><h2>计费说明</h2></template>
    <p class="desc">
      本平台以「积分」计费，<b>1 积分 = ¥1</b>。生图按逻辑模型、分辨率统一定价；
      系统会自动选择可用渠道，实际执行渠道不会改变用户售价。价格由管理后台配置并实时生效。
    </p>
    <div v-if="!modelCatalog.loaded" v-loading="true" class="loading-block" />
    <template v-else>
      <el-table :data="rows" border size="small">
        <el-table-column label="模型" prop="model" min-width="180" />
        <el-table-column label="售价（积分/张）" align="center">
          <el-table-column
            v-for="res in resolutionColumns"
            :key="res"
            :label="res"
            :prop="`prices.${res}`"
            width="120"
            align="center"
          >
            <template #default="{ row }">
              <span v-if="row.prices[res] !== null" class="price">{{ fmt(row.prices[res]) }}</span>
              <span v-else class="na">—</span>
            </template>
          </el-table-column>
        </el-table-column>
      </el-table>
      <el-empty v-if="!rows.length" description="暂无已定价的生图模型" />
      <el-alert class="note" type="info" :closable="false" show-icon title="生成失败自动全额退款。" />
    </template>
  </PageLayout>
</template>

<style scoped>
.desc { margin: 0 0 var(--momo-space-5); color: var(--momo-color-text-secondary); line-height: 1.6; }
.loading-block { min-height: 200px; }
.price { font-weight: 700; color: var(--momo-color-price); }
.na { color: var(--momo-color-text-tertiary); }
.note { margin-top: var(--momo-space-2); }
</style>
