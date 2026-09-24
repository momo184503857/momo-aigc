<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Coins, TrendingUp, Wallet } from '@lucide/vue'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { pointsApi } from '@/services/pointsApi'
import { ceilCreditValue, formatCredits } from '@/types/adapter'
import { DsScrollPage as PageLayout } from '@/components/design-system'
import type { BadgeVariants } from '@/components/design-system/primitives/badge'
import { Badge } from '@/components/design-system/primitives/badge'
import { Button } from '@/components/design-system/primitives/button'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { UiEmptyState } from '@/components/design-system'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/design-system/primitives/table'

defineOptions({ name: 'MyQuota' })

/**
 * 我的额度（fixed-channels：渠道由平台统一配置，计费单轨积分）。
 * 所有模型生图按定价扣积分（本页展示余额与流水）；生成失败自动全额退款。
 */
const { error } = useUiFeedback()

interface QuotaData {
  platform: { credits: number; yuan: number }
  recentTransactions: Array<{
    id: number; amount: number; balance_after: number
    reason: string; note: string; created_at: string
  }>
}

const quota = ref<QuotaData | null>(null)
const loading = ref(false)

const reasonLabel: Record<string, string> = {
  generation: '生图扣费',
  admin_recharge: '管理员充值',
  admin_deduct: '管理员扣减',
  refund: '失败退款',
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await pointsApi.getMyQuota()
    quota.value = res.data.data
  } catch (e: any) {
    error('加载额度失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
})

/* ─── 纯视图层派生：流水条数与变动类型的徽章配色，不参与请求逻辑 ─── */
const transactions = computed(() => quota.value?.recentTransactions || [])
const transactionCount = computed(() => transactions.value.length)

/** 与 formatCredits 完全同一取整口径，仅去掉「积分」后缀；单位在分节标题声明一次 */
function credits(value: number): string {
  return ceilCreditValue(value, 2).toFixed(2)
}

const reasonVariant: Record<string, NonNullable<BadgeVariants['variant']>> = {
  generation: 'secondary',
  admin_recharge: 'success',
  admin_deduct: 'destructive',
  refund: 'outline',
}

function badgeVariantFor(reason: string): NonNullable<BadgeVariants['variant']> {
  return reasonVariant[reason] || 'outline'
}
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>我的额度</h2>
      <p class="text-muted-foreground mt-1 text-sm">
        平台统一计费账户的积分余额与最近变动。
      </p>
    </template>

    <template #extra>
      <RouterLink to="/my-consumption">
        <Button variant="outline" size="sm" class="gap-1.5">
          <TrendingUp class="size-3.5" />
          消耗趋势
        </Button>
      </RouterLink>
      <RouterLink to="/pricing">
        <Button variant="ghost" size="sm" class="gap-1.5">
          <Wallet class="size-3.5" />
          计费说明
        </Button>
      </RouterLink>
    </template>

    <div class="content-max flex flex-col gap-5">
      <!-- ════ 余额：页面唯一的主数字，用分隔带承载而非大色块卡片 ════ -->
      <section class="flex flex-wrap items-start justify-between gap-x-10 gap-y-3 border-b pb-5">
        <div class="min-w-0">
          <p class="text-muted-foreground flex items-center gap-1.5 text-sm font-medium tracking-wider uppercase">
            <Coins class="text-warning size-3.5" />
            平台积分余额
          </p>
          <div v-if="quota" class="mt-2.5 text-sm leading-none font-semibold tabular-nums">
            {{ formatCredits(quota.platform.credits, { creditDigits: 2 }) }}
          </div>
          <Skeleton v-else class="mt-2.5 h-7 w-40" />
        </div>
        <p class="text-muted-foreground max-w-80 text-sm leading-5">
          所有生图模型按「模型 × 分辨率」统一售价扣积分；生成失败自动全额退款。
        </p>
      </section>

      <!-- ════ 流水：本页真正需要读的内容 ════ -->
      <section class="min-w-0">
        <div class="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 class="text-sm font-semibold">最近积分流水</h3>
          <Badge v-if="quota" variant="secondary" class="tabular-nums">
            {{ transactionCount }} 条
          </Badge>
          <span class="text-muted-foreground text-sm">单位：积分</span>
        </div>

        <div class="overflow-hidden rounded-lg border bg-card ">
          <Table >
            <TableHeader>
              <TableRow>
                <TableHead class="w-[150px] uppercase">时间</TableHead>
                <TableHead class="w-[104px] text-right uppercase">变动</TableHead>
                <TableHead class="w-[116px] text-right uppercase">变动后</TableHead>
                <TableHead class="w-[104px] uppercase">类型</TableHead>
                <TableHead class="uppercase">备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-if="loading">
                <TableRow v-for="i in 5" :key="`sk-${i}`">
                  <TableCell :colspan="5"><Skeleton class="h-5 w-full" /></TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow v-for="row in transactions" :key="row.id">
                  <TableCell class="tabular-nums">{{ toBJMinute(row.created_at) }}</TableCell>
                  <TableCell class="text-right tabular-nums">
                    <span :class="row.amount >= 0 ? 'text-success' : 'text-destructive'">
                      {{ row.amount >= 0 ? '+' : '' }}{{ credits(row.amount) }}
                    </span>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ credits(row.balance_after) }}
                  </TableCell>
                  <TableCell>
                    <Badge :variant="badgeVariantFor(row.reason)" >
                      {{ reasonLabel[row.reason] || row.reason }}
                    </Badge>
                  </TableCell>
                  <TableCell class="whitespace-normal">
                    {{ row.note || '—' }}
                  </TableCell>
                </TableRow>
                <TableEmpty v-if="!transactionCount" :colspan="5">
                  <UiEmptyState
                    title="暂无积分流水"
                    description="生图扣费、管理员充值/扣减与失败退款都会记录在这里。"
                  />
                </TableEmpty>
              </template>
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  </PageLayout>
</template>
