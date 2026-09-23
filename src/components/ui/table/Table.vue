<script setup lang="ts">
/**
 * Table — 表格容器
 *
 * stickyHeader / stickyLastColumn 必须实现在容器上：容器带 overflow-x-auto，
 * 浏览器会把 overflow-y:visible 计算成 auto，于是容器自己成为最近的滚动容器，
 * 写在页面外层滚动容器上的 sticky 表头永远不生效（原 el-table 的 fixed 列同理）。
 */
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  style?: HTMLAttributes['style']
  /** 表头吸顶：容器自身成为纵向滚动容器 */
  stickyHeader?: boolean
  /** stickyHeader 时容器的最大高度，CSS 值；'100%' 表示填满父级 */
  maxHeight?: string
  /** 最后一列（操作列）横向吸边，还原原 el-table fixed="right" */
  stickyLastColumn?: boolean
}>(), {
  stickyHeader: false,
  maxHeight: '100%',
  stickyLastColumn: false,
})

defineOptions({ inheritAttrs: false })
</script>

<template>
  <div
    data-slot="table-container"
    :class="cn(
      'relative w-full overflow-x-auto',
      props.stickyHeader && 'is-sticky-head',
      props.stickyLastColumn && 'is-sticky-last',
    )"
    :style="props.stickyHeader ? { maxHeight: props.maxHeight } : undefined"
  >
    <table
      v-bind="$attrs"
      data-slot="table"
      :class="cn('w-full caption-bottom text-sm', props.class)"
      :style="props.style"
    >
      <slot />
    </table>
  </div>
</template>

<style scoped>
/* 单元格吸边需要不透明底色，否则横向滚动时下层内容会透出来。
   底色默认取页面承载面 --background，--table-sticky-bg 供贴在非卡片表面上的表格覆盖。 */
.is-sticky-head :deep(th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: var(--table-sticky-bg, var(--background));
}

.is-sticky-last :deep(th:last-child),
.is-sticky-last :deep(td:last-child) {
  position: sticky;
  right: 0;
  z-index: 1;
  background-color: var(--table-sticky-bg, var(--background));
  box-shadow: inset 1px 0 0 var(--border);
}

/* TableRow 的 hover 是 bg-muted/50，吸边单元格需自行重绘，否则 hover 时脱节 */
.is-sticky-head :deep(tr:hover th),
.is-sticky-last :deep(tr:hover th:last-child),
.is-sticky-last :deep(tr:hover td:last-child) {
  background-color: var(--table-sticky-hover-bg, color-mix(in oklab, var(--muted) 50%, var(--background)));
}
</style>
