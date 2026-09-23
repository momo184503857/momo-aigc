<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Search, TrendingUp, X } from '@lucide/vue'
import { ceilCreditValue } from '@/types/adapter'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import PageLayout from '@/components/PageLayout.vue'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { UiEmptyState } from '@/components/ui'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

/* ─── 纯视图层：模型名筛选与派生最低价，便于在密集表格里扫读；不改任何取数逻辑 ─── */
const keyword = ref('')

const filteredRows = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.model.toLowerCase().includes(q))
})

/** 该模型各分辨率单价中的最低值（“起价”），无任何定价时返回 null */
function minPriceOf(row: { prices: Record<string, number | null> }): number | null {
  const values = Object.values(row.prices).filter((v): v is number => typeof v === 'number')
  return values.length ? Math.min(...values) : null
}

/** 整行都没有定价：这类模型用一枚徽章说明，而不是排一列「—」 */
function isUnpriced(row: { prices: Record<string, number | null> }): boolean {
  return minPriceOf(row) === null
}

const unpricedCount = computed(() => rows.value.filter(isUnpriced).length)
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>计费说明</h2>
      <p class="text-muted-foreground mt-1 text-[13px]">
        生图按「模型 × 分辨率」统一定价；系统自动选择可用渠道，实际执行渠道不改变用户售价。价格由管理后台配置并实时生效。
      </p>
    </template>

    <template #extra>
      <Badge variant="outline" class="tabular-nums">1 积分 = ¥1</Badge>
      <Badge variant="success" class="gap-1">
        <Check />
        生成失败自动全额退款
      </Badge>
      <RouterLink to="/my-consumption">
        <Button variant="ghost" size="sm" class="gap-1.5">
          <TrendingUp class="size-3.5" />
          我的消耗
        </Button>
      </RouterLink>
    </template>

    <!-- 本页只有一个数据面：价格矩阵，因此允许一个 bg-card 容器承载 -->
    <section class="content-max flex min-w-0 max-h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-lg border bg-card [&_[data-slot=table-container]]:min-h-0 [&_[data-slot=table-container]]:flex-1">
      <!-- 工具条：查表页最高频的动作是「找到我要用的那个模型」 -->
      <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5">
        <div class="relative w-full max-w-56">
          <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            v-model="keyword"
            type="search"
            placeholder="搜索模型"
            aria-label="搜索模型"
            class="h-8 pr-7 pl-8 text-[13px]"
          />
          <button
            v-if="keyword"
            type="button"
            aria-label="清除搜索"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            @click="keyword = ''"
          >
            <X class="size-3.5" />
          </button>
        </div>

        <Badge variant="secondary" class="tabular-nums">
          {{ filteredRows.length }} / {{ rows.length }} 个模型
        </Badge>
        <span
          v-if="unpricedCount"
          class="text-muted-foreground text-[12px] tabular-nums"
        >
          {{ unpricedCount }} 个未定价
        </span>

        <span
          v-if="resolutionColumns.length"
          class="text-muted-foreground ml-auto text-[12px] tabular-nums"
        >
          {{ resolutionColumns.length }} 档分辨率 · 单位：积分 / 张
        </span>
      </div>

      <div v-if="!modelCatalog.loaded" class="flex shrink-0 flex-col gap-2 p-3">
        <Skeleton v-for="i in 5" :key="i" class="h-9 w-full" />
      </div>

      <Table v-else class="[&_td]:py-1.5 [&_td]:text-[13px] [&_th]:px-2.5">
        <TableHeader>
          <TableRow>
            <TableHead class="bg-card sticky top-0 z-30 h-9 min-w-[200px] text-[11px] font-medium tracking-wider uppercase">
              模型
            </TableHead>
            <TableHead class="bg-card sticky top-0 z-30 h-9 w-[92px] text-right text-[11px] font-medium tracking-wider uppercase">
              起价
            </TableHead>
            <TableHead
              v-for="res in resolutionColumns"
              :key="res"
              class="bg-card sticky top-0 z-30 h-9 w-[104px] border-l text-right text-[11px] font-medium"
            >
              {{ res }}
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="row in filteredRows" :key="row.key">
            <TableCell class="min-w-[200px] font-medium whitespace-normal">
              {{ row.model }}
              <Badge v-if="isUnpriced(row)" variant="destructive" class="ml-1.5 font-normal">
                未定价
              </Badge>
            </TableCell>
            <TableCell class="text-right tabular-nums">
              <span v-if="!isUnpriced(row)" class="text-muted-foreground">{{ fmt(minPriceOf(row) as number) }}</span>
              <span v-else class="text-muted-foreground/40">—</span>
            </TableCell>
            <TableCell
              v-for="(res, i) in resolutionColumns"
              :key="res"
              :class="cn('w-[104px] text-right tabular-nums', i === 0 && 'border-l')"
            >
              <span v-if="row.prices[res] !== null" class="font-semibold text-(--momo-color-price)">
                {{ fmt(row.prices[res] as number) }}
              </span>
              <span v-else class="text-muted-foreground/40">—</span>
            </TableCell>
          </TableRow>

          <TableEmpty v-if="!filteredRows.length" :colspan="resolutionColumns.length + 2">
            <UiEmptyState
              v-if="keyword"
              :title="`没有匹配「${keyword}」的模型`"
              description="模型目录由管理后台维护，可换一个关键词试试。"
            >
              <Button size="sm" variant="outline" @click="keyword = ''">清除搜索</Button>
            </UiEmptyState>
            <UiEmptyState
              v-else
              title="暂无已定价的生图模型"
              description="模型与售价由管理后台配置，配置完成后本页会实时生效。"
            />
          </TableEmpty>
        </TableBody>
      </Table>
    </section>
  </PageLayout>
</template>
