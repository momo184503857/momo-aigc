<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ceilCreditValue } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import type { CatalogModel } from '@/stores/modelCatalog'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'Pricing' })

/** 定价真源 = 后端模型目录（渠道×模型×分辨率），不再前端硬编码（M3-06） */
const modelCatalog = useModelCatalogStore()
onMounted(() => modelCatalog.ensureLoaded())

interface PriceRow {
  resolution: string
  /** 与表列（渠道模型）下标对齐：单价（积分/张）；该渠道不提供此分辨率时为 null */
  cells: (number | null)[]
  /** 本行最低价（比价标识）；无任何报价为 null */
  min: number | null
}

interface PriceTable {
  /** 逻辑模型去重 key（logicalCode ?? modelId） */
  key: string
  label: string
  /** 列 = 提供该逻辑模型的全部渠道模型（目录顺序） */
  channels: CatalogModel[]
  rows: PriceRow[]
}

/** 每个逻辑模型一张价格矩阵：行 = 各渠道分辨率的并集（首现顺序），列 = 渠道 */
const tables = computed<PriceTable[]>(() =>
  modelCatalog.imageLogicalModels
    .map((lm): PriceTable => {
      const channels = lm.channelModels.filter((m) => m.pricing && m.capabilities?.resolutions?.length)
      const resolutions: string[] = []
      for (const c of channels)
        for (const r of c.capabilities?.resolutions ?? [])
          if (!resolutions.includes(r)) resolutions.push(r)
      const rows = resolutions.map((r) => {
        const cells = channels.map<number | null>((c) =>
          c.capabilities!.resolutions!.includes(r) ? (c.pricing![r] ?? null) : null,
        )
        const priced = cells.filter((v): v is number => v !== null)
        return { resolution: r, cells, min: priced.length ? Math.min(...priced) : null }
      })
      return { key: lm.key, label: lm.label, channels, rows }
    })
    .filter((t) => t.channels.length > 0 && t.rows.length > 0),
)

/** 同一逻辑模型下同名渠道出现多次时，用渠道模型名消歧 */
function channelTitle(t: PriceTable, index: number): string {
  const c = t.channels[index]
  return t.channels.filter((x) => x.providerName === c.providerName).length > 1
    ? `${c.providerName} · ${c.modelId}`
    : c.providerName
}

function fmt(v: number): string {
  return ceilCreditValue(v, 2).toFixed(2)
}
</script>

<template>
  <PageLayout>
    <template #header><h2>计费说明</h2></template>

    <p class="desc">
      本平台以「积分」计费，<b>1 积分 = ¥1</b>。生图统一<b>按张计费</b>，价格由
      渠道 × 模型 × 分辨率 决定：下表每个模型<b>一行一个分辨率、一列一个渠道</b>，
      同一模型在不同渠道价格可能不同（<b>高亮</b>为该分辨率下的最低价，
      <span class="na">—</span> 表示该渠道不提供此分辨率）。
      价格由管理后台统一配置，实时生效。
    </p>

    <div v-if="!modelCatalog.loaded" v-loading="true" class="loading-block" />

    <template v-else>
      <section v-for="t in tables" :key="t.key" class="model-block">
        <h3 class="model-name">{{ t.label }}<span class="model-code">{{ t.key }}</span></h3>
        <el-table :data="t.rows" border size="small">
          <el-table-column label="分辨率" prop="resolution" width="120" align="center" />
          <el-table-column
            v-for="(c, ci) in t.channels"
            :key="c.id"
            :label="channelTitle(t, ci)"
            min-width="150"
            align="center"
          >
            <template #default="{ row }">
              <span v-if="row.cells[ci] === null" class="na">—</span>
              <span v-else-if="row.min !== null && row.cells[ci] === row.min" class="price-cell">
                {{ fmt(row.cells[ci]) }}
              </span>
              <span v-else class="price">{{ fmt(row.cells[ci]) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <el-empty v-if="!tables.length" description="暂无已定价的生图模型" />

      <el-alert
        class="note"
        type="info" :closable="false" show-icon
        title="生成失败自动全额退款。"
      />
    </template>
  </PageLayout>
</template>

<style scoped>
.desc {
  margin: 0 0 20px 0;
  font-size: var(--momo-font-size-base, 14px);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.loading-block {
  min-height: 200px;
}
.model-block {
  margin-bottom: 24px;
}
.model-name {
  margin: 0 0 8px 0;
  font-size: var(--momo-font-size-lg, 16px);
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
}
.model-code {
  margin-left: 8px;
  font-size: var(--momo-font-size-sm, 12px);
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.price-cell {
  font-weight: 700;
  color: var(--el-color-primary);
}
.price {
  color: var(--el-text-color-regular);
}
.na {
  color: var(--el-text-color-placeholder);
}
.note {
  margin-top: 8px;
}
</style>
