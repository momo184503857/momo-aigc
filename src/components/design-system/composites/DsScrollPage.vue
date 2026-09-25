<script setup lang="ts">
/**
 * DsScrollPage — 页面外壳（用户端 / 管理端共用）
 *
 * 区域：可选标题（header）、独立工具栏（actions + extra + filters）、滚动主体（default）、动作栏（footer）。
 * 外壳只划分区域与归属滚动，不包裹卡片；主体若需要独立表面（表格、画布、图集）由页面自己声明。
 *
 * 契约（不可破坏）：
 * - `.page-content` 是整页唯一的滚动容器，也是部分页面 IntersectionObserver 的 root，
 *   类名与 overflow-auto 不可更名或移除；MainLayout 侧不再滚动、不再补 padding。
 * - 动作栏内容带 v-if 的页面须显式传 `:show-footer`，否则隐藏内容时仍会画出分隔线。
 */
import { computed, useSlots } from 'vue'

interface Props {
  /** 默认不展示页级标题与说明；展厅等特殊场景可显式开启。 */
  showHeading?: boolean
  title?: string
  subtitle?: string
  /** 主体最大宽度（CSS 值，如 '60rem'）；不设置则铺满 */
  maxWidth?: string
  /** 主体内边距；'0' 表示页面自行控制（全出血 / 两栏工作台） */
  contentPadding?: string
  /** 显式控制动作栏是否出现 */
  showFooter?: boolean
  /** 是否展示底栏分隔线，默认保留。 */
  dividers?: boolean
  /** 滚动容器边缘与底栏内容对齐，横向留白改为外边距。 */
  insetContent?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showHeading: false,
  title: '',
  subtitle: '',
  maxWidth: '',
  contentPadding: 'var(--ds-space-6)',
  showFooter: undefined,
  dividers: true,
  insetContent: false,
})

const slots = useSlots()
const hasFooter = computed(() => props.showFooter ?? !!slots.footer)
</script>

<template>
  <div class="page-container flex h-full min-h-0 flex-col">
    <header
      v-if="showHeading && (slots.header || props.title)"
      class="page-header shrink-0 bg-background px-(--ds-space-6) pt-4 pb-3"
    >
      <slot name="header">
        <h2 v-if="props.title">{{ props.title }}</h2>
        <p v-if="props.subtitle" class="text-muted-foreground mt-1 max-w-3xl ds-caption leading-normal">{{ props.subtitle }}</p>
      </slot>
    </header>

    <!-- 功能操作与页级标题分离，移除标题不影响返回、筛选和业务动作。 -->
    <div v-if="slots.actions || slots.extra || slots.filters" class="page-toolbar shrink-0 bg-background px-(--ds-space-6) pt-4 pb-3">
      <div v-if="slots.actions || slots.extra" class="flex flex-wrap items-center justify-between gap-3">
        <div v-if="slots.actions" class="flex min-w-0 flex-wrap items-center gap-2"><slot name="actions" /></div>
        <div v-if="slots.extra" class="page-header-extra ml-auto flex flex-wrap items-center gap-2"><slot name="extra" /></div>
      </div>
      <div v-if="slots.filters" :class="{ 'mt-3': slots.actions || slots.extra }" class="flex flex-wrap items-center gap-x-3 gap-y-2"><slot name="filters" /></div>
    </div>

    <div
      class="page-content animate-in min-h-0 flex-1 overflow-auto duration-200 fade-in"
      :style="{ padding: props.contentPadding, marginInline: insetContent ? 'var(--ds-space-6)' : undefined, paddingInline: insetContent ? '0' : undefined }"
    >
      <div v-if="props.maxWidth" class="mx-auto w-full" :style="{ maxWidth: props.maxWidth }">
        <slot />
      </div>
      <slot v-else />
    </div>

    <footer
      v-if="hasFooter"
      :class="{ 'border-t': dividers }"
      class="page-footer shrink-0 bg-background px-(--ds-space-6) py-3"
    >
      <slot name="footer" />
    </footer>
  </div>
</template>
