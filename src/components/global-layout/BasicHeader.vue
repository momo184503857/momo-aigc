<script setup lang="ts">
/**
 * BasicHeader —— 页面级标题带（移植 reference-ui global-layout/basic-header.vue）
 *
 * reference 的滚动容器是窗口，吸顶带用 top-14 让开应用栏；本项目应用栏在滚动容器之外、
 * 由 AdminLayout 的 main 自己滚动，所以吸顶基准换成 top-0。顶部留白收进带内（pt-4），
 * 保证吸顶时不透明底色与标题之间不露出滚动内容的缝隙。
 */
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  sticky?: boolean
  class?: string
}>(), {
  title: '',
  description: '',
  sticky: false,
})
</script>

<template>
  <header
    :class="cn(
      'bg-background flex flex-col justify-between gap-2 pt-4 pb-2 md:flex-row',
      props.sticky && 'sticky top-0 z-40',
      props.class,
    )"
  >
    <div class="min-w-0">
      <h1 class="text-2xl font-bold">{{ props.title }}</h1>
      <p v-if="props.description" class="text-muted-foreground">
        {{ props.description }}
      </p>
    </div>

    <aside class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </aside>
  </header>
</template>

<style scoped>
/* reference 的 h1 直接吃 Tailwind 标度（24px/700），这里不再套用 PageLayout 的 18px 语义 */
h1 {
  letter-spacing: -0.01em;
}
</style>
