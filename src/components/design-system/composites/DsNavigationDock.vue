<script setup lang="ts">
import type { Component } from 'vue'
import { Button } from '../primitives/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../primitives/hover-card'

type DockItem = { path: string; title: string; icon: Component; active?: boolean }
defineProps<{
  items: (DockItem & { children?: DockItem[] })[]
  label?: string
  orientation?: 'vertical' | 'horizontal'
}>()
const emit = defineEmits<{ navigate: [path: string] }>()
</script>

<template>
  <nav :class="orientation === 'horizontal' ? 'ds-segmented-nav' : 'ds-navigation-dock'" :aria-label="label || '主导航'">
    <template v-for="item in items" :key="item.path">
      <HoverCard v-if="orientation !== 'horizontal' && item.children?.length" :open-delay="150" :close-delay="200">
        <HoverCardTrigger as-child data-slot="button">
          <Button type="button" variant="dock" size="dock" :aria-current="item.active ? 'true' : undefined"
            @click="emit('navigate', item.children[0]!.path)">
            <component :is="item.icon" class="size-7" aria-hidden="true" />
            <span>{{ item.title }}</span>
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" :side-offset="12" class="ds-dock-submenu">
          <div class="ds-dock-children" role="group" :aria-label="`${item.title}子页面`">
            <Button v-for="child in item.children" :key="child.path" type="button"
              :variant="child.active ? 'default' : 'ghost'" class="ds-dock-child"
              :aria-current="child.active ? 'page' : undefined" @click="emit('navigate', child.path)">
              <component :is="child.icon" class="size-4" aria-hidden="true" />
              {{ child.title }}
            </Button>
          </div>
        </HoverCardContent>
      </HoverCard>
      <Button v-else type="button"
        :variant="orientation === 'horizontal' ? 'segment' : 'dock'" :size="orientation === 'horizontal' ? 'default' : 'dock'"
        :aria-current="item.active ? 'page' : undefined" @click="emit('navigate', item.path)">
        <component :is="item.icon" :class="orientation === 'horizontal' ? 'size-4' : 'size-7'" aria-hidden="true" />
        <span>{{ item.title }}</span>
      </Button>
    </template>
  </nav>
</template>
