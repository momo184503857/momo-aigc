<script setup lang="ts">
import { computed } from 'vue'

/** 常驻关联面板：尖角从顶部指向上方来源，不包含悬浮/弹出行为。 */
const props = withDefaults(defineProps<{
  title: string
  anchorOffset?: number
  anchorLabel?: string
}>(), { anchorOffset: 40 })
const anchorStyle = computed(() => ({ '--ds-linked-anchor': `${Math.max(0, props.anchorOffset)}px` }))
</script>

<template>
  <section class="ds-panel ds-stack ds-linked-panel" :style="anchorStyle" :aria-label="anchorLabel ? `${anchorLabel} · ${title}` : title">
    <span class="ds-linked-panel-arrow" aria-hidden="true" />
    <header class="ds-detail-heading ds-linked-panel-heading">
      <h2 class="ds-heading">{{ title }}</h2>
      <slot name="actions" />
    </header>
    <slot />
    <footer v-if="$slots.footer" class="ds-footer"><slot name="footer" /></footer>
  </section>
</template>
