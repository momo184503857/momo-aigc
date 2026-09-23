<script setup lang="ts">
/**
 * DataTableToolbar —— 表格工具行（移植 reference-ui data-table/table-toolbar.vue）
 *
 * reference 版靠 tanstack 的 column API 驱动，这里保留它的外观骨架与节奏
 * （左簇 h-8 控件 + gap-2，右侧动作），把筛选控件交给调用方以插槽传入。
 */
import { X } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  /** 是否有生效中的筛选条件，决定是否出现「重置」 */
  filtered?: boolean
  resetText?: string
}>(), {
  filtered: false,
  resetText: '重置',
})

const emit = defineEmits<{ reset: [] }>()
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <div class="flex flex-1 flex-col items-start gap-2 md:flex-row md:items-center">
      <slot />

      <Button
        v-if="props.filtered"
        variant="ghost"
        class="h-8 px-2 lg:px-3"
        @click="emit('reset')"
      >
        {{ props.resetText }}
        <X class="size-4" />
      </Button>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <slot name="right" />
    </div>
  </div>
</template>
