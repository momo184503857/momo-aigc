<script setup lang="ts">
import DsThumbnail from './DsThumbnail.vue'
import { ImageOff } from '@lucide/vue'
import { Button } from '../primitives/button'
withDefaults(defineProps<{ title: string; description: string; imageUrl?: string; disabled?: boolean }>(), { imageUrl: '', disabled: false })
const emit = defineEmits<{ enter: [] }>()
</script>
<template>
  <article class="ds-tool-card">
    <div class="ds-tool-card-media">
      <DsThumbnail v-if="imageUrl" :src="imageUrl" :alt="`${title}介绍`" class="size-full object-cover" />
      <div v-else class="ds-tool-card-placeholder"><ImageOff aria-hidden="true" /><span>无图片介绍</span></div>
    </div>
    <div class="ds-tool-card-heading">
      <h3 class="ds-tool-card-title">{{ title }}</h3>
      <Button v-if="!$slots.actions" variant="default" size="sm" :disabled="disabled" :aria-label="disabled ? `${title}，敬请期待` : `进入${title}`" @click="emit('enter')">
        {{ disabled ? '敬请期待' : '进入' }}
      </Button>
    </div>
    <div class="ds-tool-card-footer">
      <p class="ds-tool-card-description">{{ description }}</p>
      <slot name="actions" />
    </div>
  </article>
</template>
