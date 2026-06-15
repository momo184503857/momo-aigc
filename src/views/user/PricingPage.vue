<script setup lang="ts">
import { MODELS, formatCredits } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'Pricing' })

interface Row { resolution: string; price: number }

function rowsOf(model: typeof MODELS[0]): Row[] {
  return model.resolutions.map(r => ({ resolution: r, price: model.pricing[r] ?? 0 }))
}
</script>

<template>
  <PageLayout>
    <template #header><h2>计费说明</h2></template>

    <p class="desc">
      本平台以「积分」计费，<b>1 积分 = ¥0.035</b>。各模型不同分辨率单价如下
      （扣费以积分为准，括号内为折合人民币）。
    </p>

    <div v-for="m in MODELS" :key="m.id" class="model-block">
      <h3 class="model-name">{{ m.name }}</h3>
      <el-table :data="rowsOf(m)" border size="small">
        <el-table-column label="分辨率" prop="resolution" width="160" />
        <el-table-column label="单价（每张）">
          <template #default="{ row }">
            <span class="price-cell">{{ formatCredits(row.price) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-alert
      class="note"
      type="info" :closable="false" show-icon
      title="使用个人 Key 生图不消耗平台积分（费用由你的 ToAPIs 账户承担）。"
    />
  </PageLayout>
</template>

<style scoped>
.desc {
  margin: 0 0 20px 0;
  font-size: var(--momo-font-size-base, 14px);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.model-block {
  margin-bottom: 20px;
}
.model-name {
  margin: 0 0 8px 0;
  font-size: var(--momo-font-size-lg, 16px);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.price-cell {
  font-weight: 600;
  color: var(--el-color-primary);
}
.note {
  margin-top: 8px;
}
</style>
