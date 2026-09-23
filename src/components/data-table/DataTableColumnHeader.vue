<script setup lang="ts">
/**
 * DataTableColumnHeader —— 可排序表头（移植 reference-ui data-table/column-header.vue）
 *
 * reference 用 tanstack 的 column.toggleSorting，这里改为把「目标方向」抛给父级：
 * 管理端表格全部是后端排序（sort + order 两个参数），表头只负责表达意图。
 */
import { ArrowDown, ArrowUp, ChevronsUpDown } from '@lucide/vue'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  label: string
  /** 排序字段名；留空则退化为普通表头文本 */
  sortKey?: string
  /** 当前生效排序字段 */
  activeKey?: string
  /** 当前生效方向 */
  activeOrder?: 'asc' | 'desc' | ''
  align?: 'start' | 'end'
  class?: string
}>(), {
  sortKey: '',
  activeKey: '',
  activeOrder: '',
  align: 'start',
})

const emit = defineEmits<{ sort: [order: 'asc' | 'desc' | null] }>()

const isAsc = computed(() => !!props.sortKey && props.activeKey === props.sortKey && props.activeOrder === 'asc')
const isDesc = computed(() => !!props.sortKey && props.activeKey === props.sortKey && props.activeOrder === 'desc')
</script>

<template>
  <div
    v-if="sortKey"
    :class="cn('flex items-center gap-2', align === 'end' && 'justify-end', props.class)"
  >
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="sm"
          :class="cn(
            'h-8 font-medium data-[state=open]:bg-accent',
            align === 'end' ? '-mr-2.5' : '-ml-2.5',
          )"
        >
          <span>{{ label }}</span>
          <ArrowDown v-if="isDesc" class="ml-2 size-4" />
          <ArrowUp v-else-if="isAsc" class="ml-2 size-4" />
          <ChevronsUpDown v-else class="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent :align="align" class="w-[140px]">
        <DropdownMenuItem @click="emit('sort', 'asc')">
          <ArrowUp class="text-muted-foreground/70 mr-2 size-4" />
          升序
        </DropdownMenuItem>
        <DropdownMenuItem @click="emit('sort', 'desc')">
          <ArrowDown class="text-muted-foreground/70 mr-2 size-4" />
          降序
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @click="emit('sort', null)">
          <ChevronsUpDown class="text-muted-foreground/70 mr-2 size-4" />
          取消排序
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>

  <div v-else :class="cn(props.class)">
    {{ label }}
  </div>
</template>
