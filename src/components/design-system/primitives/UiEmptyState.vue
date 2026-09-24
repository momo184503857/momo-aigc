<script setup lang="ts">
import { Inbox } from '@lucide/vue'

withDefaults(defineProps<{
  title: string
  description?: string
}>(), {
  description: '',
})
</script>

<template>
  <div class="flex flex-col items-center justify-center px-4 py-12 text-center">
    <Inbox class="text-muted-foreground/50 size-10" :stroke-width="1.5" />
    <div class="text-foreground mt-3 text-sm">{{ title }}</div>
    <div v-if="description" class="text-muted-foreground mt-1 max-w-sm text-xs leading-5">
      {{ description }}
    </div>
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>
