<script setup lang="ts">
/**
 * PageLayout — 页面外壳（用户端 / 管理端共用）
 *
 * 四个区域：标题行（header + extra）、筛选行（filters）、滚动主体（default）、动作栏（footer）。
 * 外壳只划分区域与归属滚动，不包裹卡片；主体若需要独立表面（表格、画布、图集）由页面自己声明。
 *
 * 契约（不可破坏）：
 * - `.page-content` 是整页唯一的滚动容器，也是部分页面 IntersectionObserver 的 root，
 *   类名与 overflow-auto 不可更名或移除；MainLayout 侧不再滚动、不再补 padding。
 * - 动作栏内容带 v-if 的页面须显式传 `:show-footer`，否则隐藏内容时仍会画出分隔线。
 */
import { computed, useSlots } from 'vue'

interface Props {
  title?: string
  subtitle?: string
  /** 主体最大宽度（CSS 值，如 '60rem'）；不设置则铺满 */
  maxWidth?: string
  /** 主体内边距；'0' 表示页面自行控制（全出血 / 两栏工作台） */
  contentPadding?: string
  /** 显式控制动作栏是否出现 */
  showFooter?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  maxWidth: '',
  contentPadding: 'var(--momo-page-padding)',
  showFooter: undefined,
})

const slots = useSlots()
const hasFooter = computed(() => props.showFooter ?? !!slots.footer)
</script>

<template>
  <div class="page-container flex h-full min-h-0 flex-col">
    <header
      v-if="slots.header || props.title || slots.extra || slots.filters"
      class="page-header shrink-0 border-b bg-background px-(--momo-page-padding) pt-4 pb-3"
    >
      <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div class="min-w-0 flex-1">
          <slot name="header">
            <h2 v-if="props.title">{{ props.title }}</h2>
            <p v-if="props.subtitle" class="text-muted-foreground mt-1 max-w-3xl text-[13px] leading-normal">
              {{ props.subtitle }}
            </p>
          </slot>
        </div>
        <div v-if="slots.extra" class="page-header-extra flex shrink-0 flex-wrap items-center gap-2">
          <slot name="extra" />
        </div>
      </div>
      <div v-if="slots.filters" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <slot name="filters" />
      </div>
    </header>

    <div
      class="page-content animate-in min-h-0 flex-1 overflow-auto duration-200 fade-in"
      :style="{ padding: props.contentPadding }"
    >
      <div v-if="props.maxWidth" class="mx-auto w-full" :style="{ maxWidth: props.maxWidth }">
        <slot />
      </div>
      <slot v-else />
    </div>

    <footer
      v-if="hasFooter"
      class="page-footer shrink-0 border-t bg-background px-(--momo-page-padding) py-3"
    >
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
/* 各页面在 #header 插槽里直接写 <h2> 作为页面标题；Tailwind preflight 会抹平
   标题默认字号，这里统一收口，避免逐页补样式 */
.page-header :deep(h1),
.page-header :deep(h2) {
  margin: 0;
  font-size: var(--momo-font-size-xl);
  font-weight: var(--momo-font-weight-semibold);
  line-height: var(--momo-leading-tight);
  letter-spacing: var(--momo-tracking-tight);
  color: var(--momo-color-text);
}

/* 页头里混排了次级标题时（如列表页的筛选行标题），不再抢主标题的视觉权重 */
.page-header :deep(h3) {
  margin: 0;
  font-size: var(--momo-font-size-base);
  font-weight: var(--momo-font-weight-medium);
  line-height: var(--momo-leading-tight);
  color: var(--momo-color-text);
}
</style>
