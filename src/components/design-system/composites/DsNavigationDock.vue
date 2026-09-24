<script setup lang="ts">
import type { Component } from 'vue'
import { Button } from '../primitives/button'

defineProps<{
  items: { path: string; title: string; icon: Component; active?: boolean }[]
  label?: string
  orientation?: 'vertical' | 'horizontal'
}>()
const emit = defineEmits<{ navigate: [path: string] }>()
</script>

<template>
  <nav :class="orientation === 'horizontal' ? 'ds-segmented-nav' : 'ds-navigation-dock'" :aria-label="label || '主导航'">
    <Button
      v-for="item in items" :key="item.path" type="button"
      :variant="orientation === 'horizontal' ? 'segment' : 'dock'" :size="orientation === 'horizontal' ? 'default' : 'dock'" :aria-current="item.active ? 'page' : undefined"
      @click="emit('navigate', item.path)"
    >
      <component :is="item.icon" :class="orientation === 'horizontal' ? 'size-4' : 'size-7'" aria-hidden="true" />
      <span>{{ item.title }}</span>
    </Button>
  </nav>
</template>
