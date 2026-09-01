<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { formatCredits } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'Pricing' })

/** 定价真源 = 后端模型目录（渠道×模型×分辨率），不再前端硬编码（M3-06） */
const modelCatalog = useModelCatalogStore()
onMounted(() => modelCatalog.ensureLoaded())

interface Row { resolution: string; price: number }

/** 渠道分组（每组内每个模型一张定价表） */
const platformGroups = computed(() =>
  modelCatalog.imageGroups
    .map((g) => ({
      ...g,
      models: g.models.filter((m) => m.pricing && m.capabilities),
    }))
    .filter((g) => g.models.length > 0),
)

function rowsOf(pricing: Record<string, number> | null, resolutions: string[]): Row[] {
  if (!pricing) return []
  return resolutions.map((r) => ({ resolution: r, price: pricing[r] ?? 0 }))
}
</script>

<template>
  <PageLayout>
    <template #header><h2>计费说明</h2></template>

    <p class="desc">
      本平台以「积分」计费，<b>1 积分 = ¥1</b>。模型按「渠道 × 模型 × 分辨率」定价，
      同一模型在不同渠道价格可能不同。价格由管理后台统一配置，如下表实时生效。
    </p>

    <div v-if="!modelCatalog.loaded" v-loading="true" class="loading-block" />

    <template v-else>
      <div v-for="group in platformGroups" :key="group.providerId" class="provider-block">
        <h3 class="provider-name">{{ group.providerName }}</h3>
        <div v-for="m in group.models" :key="m.id" class="model-block">
          <h4 class="model-name">{{ m.displayName }}<span class="model-code">{{ m.logicalCode ?? m.modelId }}</span></h4>
          <el-table :data="rowsOf(m.pricing, m.capabilities?.resolutions ?? [])" border size="small">
            <el-table-column label="分辨率" prop="resolution" width="160" />
            <el-table-column label="单价（每张）">
              <template #default="{ row }">
                <span class="price-cell">{{ formatCredits(row.price) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

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
.provider-block {
  margin-bottom: 24px;
}
.provider-name {
  margin: 0 0 8px 0;
  font-size: var(--momo-font-size-lg, 16px);
  font-weight: 600;
  color: var(--el-text-color-primary);
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
}
.model-block {
  margin-bottom: 16px;
}
.model-name {
  margin: 0 0 8px 0;
  font-size: var(--momo-font-size-base, 14px);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.model-code {
  margin-left: 8px;
  font-size: var(--momo-font-size-sm, 12px);
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.price-cell {
  font-weight: 600;
  color: var(--el-color-primary);
}
.note {
  margin-top: 8px;
}
</style>
