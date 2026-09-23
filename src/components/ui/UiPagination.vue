<script setup lang="ts">
/**
 * UiPagination — 统一分页条：总数 + 每页条数 + 页码
 * 保留 v-model:current-page / v-model:page-size 与 current-change / size-change 事件
 */
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = withDefaults(defineProps<{
  currentPage: number
  pageSize: number
  total: number
  pageSizes?: number[]
  hideOnEmpty?: boolean
  disabled?: boolean
  showSizeSelector?: boolean
}>(), {
  pageSizes: () => [10, 20, 50, 100],
  hideOnEmpty: true,
  disabled: false,
  showSizeSelector: true,
})

const emit = defineEmits<{
  'update:currentPage': [value: number]
  'update:pageSize': [value: number]
  currentChange: [value: number]
  sizeChange: [value: number]
}>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / (props.pageSize || 1))))

/** 页码序列：当前页前后各 1 页，首尾始终显示，中间用省略号 */
const pages = computed<Array<number | 'ellipsis'>>(() => {
  const total = pageCount.value
  const current = props.currentPage
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const set = new Set<number>([1, total, current - 1, current, current + 1])
  const list = Array.from(set).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: Array<number | 'ellipsis'> = []
  let prev = 0
  for (const p of list) {
    if (prev && p - prev > 1) out.push('ellipsis')
    out.push(p)
    prev = p
  }
  return out
})

function go(p: number) {
  if (props.disabled) return
  const next = Math.max(1, Math.min(pageCount.value, p))
  if (next === props.currentPage) return
  emit('update:currentPage', next)
  emit('currentChange', next)
}

function handleSizeChange(value: string) {
  const size = Number(value)
  emit('update:pageSize', size)
  emit('sizeChange', size)
}

/** 「跳至第 N 页」：Enter / 失焦提交，复用 go() 的边界收敛与事件派发 */
const jumper = ref('')
function submitJump() {
  const raw = jumper.value.trim()
  jumper.value = ''
  const n = Math.round(Number(raw))
  if (!raw || !Number.isFinite(n)) return
  go(n)
}
</script>

<template>
  <div v-if="!hideOnEmpty || total > 0" class="flex flex-wrap items-center justify-end gap-3">
    <span class="text-muted-foreground text-sm tabular-nums">共 {{ total }} 条</span>

    <Select
      v-if="showSizeSelector"
      :model-value="String(pageSize)"
      :disabled="disabled"
      @update:model-value="handleSizeChange(String($event))"
    >
      <SelectTrigger class="w-26">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="size in pageSizes" :key="size" :value="String(size)">
          {{ size }}条/页
        </SelectItem>
      </SelectContent>
    </Select>

    <nav class="flex items-center gap-0.5" aria-label="分页">
      <Button
        variant="ghost"
        size="icon"
        :disabled="disabled || currentPage <= 1"
        title="第一页"
        @click="go(1)"
      >
        <ChevronsLeft />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :disabled="disabled || currentPage <= 1"
        title="上一页"
        @click="go(currentPage - 1)"
      >
        <ChevronLeft />
      </Button>

      <template v-for="(item, index) in pages" :key="index">
        <span v-if="item === 'ellipsis'" class="text-muted-foreground px-1 text-sm">…</span>
        <Button
          v-else
          :variant="item === currentPage ? 'outline' : 'ghost'"
          size="icon"
          :disabled="disabled"
          :aria-current="item === currentPage ? 'page' : undefined"
          @click="go(item)"
        >
          {{ item }}
        </Button>
      </template>

      <Button
        variant="ghost"
        size="icon"
        :disabled="disabled || currentPage >= pageCount"
        title="下一页"
        @click="go(currentPage + 1)"
      >
        <ChevronRight />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :disabled="disabled || currentPage >= pageCount"
        title="最后一页"
        @click="go(pageCount)"
      >
        <ChevronsRight />
      </Button>
    </nav>

    <div v-if="pageCount > 1" class="flex items-center gap-1.5">
      <span class="text-muted-foreground text-sm">跳至</span>
      <Input
        v-model="jumper"
        inputmode="numeric"
        class="h-7 w-14 px-1 text-center"
        :aria-label="`跳至第几页（1-${pageCount}）`"
        @keyup.enter="submitJump"
        @blur="submitJump"
      />
      <span class="text-muted-foreground text-sm">页</span>
    </div>
  </div>
</template>
