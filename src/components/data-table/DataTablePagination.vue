<script setup lang="ts">
/**
 * DataTablePagination —— 服务端分页条（移植 reference-ui data-table/table-pagination.vue）
 *
 * 与 UiPagination 的区别：reference 的分页条不画页码，只有「每页行数 + Page X of Y + 四个
 * outline 方向键」，并且放在表格外框之下。这里保持同一形态，同时沿用父级已有的
 * current-page / page-size 双向绑定契约，方便逐页替换。
 */
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue'
import { computed } from 'vue'
import { Button } from '@/components/design-system/primitives/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/design-system/primitives/select'

const props = withDefaults(defineProps<{
  currentPage: number
  pageSize: number
  total: number
  pageSizes?: number[]
  disabled?: boolean
}>(), {
  pageSizes: () => [10, 20, 50, 100],
  disabled: false,
})

const emit = defineEmits<{
  'update:currentPage': [value: number]
  'update:pageSize': [value: number]
  currentChange: [value: number]
  sizeChange: [value: number]
}>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / (props.pageSize || 1))))
const canPrev = computed(() => props.currentPage > 1)
const canNext = computed(() => props.currentPage < pageCount.value)

function go(p: number) {
  if (props.disabled) return
  const next = Math.max(1, Math.min(pageCount.value, p))
  if (next === props.currentPage) return
  emit('update:currentPage', next)
  emit('currentChange', next)
}

function handleSizeChange(value: string) {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) return
  emit('update:pageSize', size)
  emit('sizeChange', size)
}
</script>

<template>
  <div class="bg-background flex items-center justify-between px-2 py-2">
    <span class="text-muted-foreground text-sm tabular-nums">共 {{ total }} 条</span>

    <div class="flex items-center space-x-6 lg:space-x-8">
      <div class="flex items-center space-x-2">
        <p class="text-sm font-medium line-clamp-1 hidden md:block">
          每页条数
        </p>
        <Select
          :model-value="String(pageSize)"
          :disabled="disabled"
          @update:model-value="handleSizeChange(String($event))"
        >
          <SelectTrigger class="w-[70px]">
            <SelectValue :placeholder="String(pageSize)" />
          </SelectTrigger>
          <SelectContent side="top">
            <SelectItem v-for="size in pageSizes" :key="size" :value="String(size)">
              {{ size }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex w-[100px] items-center justify-center text-sm font-medium tabular-nums">
        第 {{ currentPage }} / {{ pageCount }} 页
      </div>

      <div class="flex items-center space-x-2">
        <Button variant="outline" class="hidden lg:flex" :disabled="!canPrev" title="首页" @click="go(1)">
          <span class="sr-only">首页</span>
          <ChevronsLeft class="size-4" />
        </Button>
        <Button variant="outline"  :disabled="!canPrev" title="上一页" @click="go(currentPage - 1)">
          <span class="sr-only">上一页</span>
          <ChevronLeft class="size-4" />
        </Button>
        <Button variant="outline"  :disabled="!canNext" title="下一页" @click="go(currentPage + 1)">
          <span class="sr-only">下一页</span>
          <ChevronRight class="size-4" />
        </Button>
        <Button variant="outline" class="hidden lg:flex" :disabled="!canNext" title="末页" @click="go(pageCount)">
          <span class="sr-only">末页</span>
          <ChevronsRight class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
