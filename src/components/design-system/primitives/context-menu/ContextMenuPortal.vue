<script setup lang="ts">
import { useDesignSystem } from "@/components/design-system/context"
const { portalTarget } = useDesignSystem()
import type { ContextMenuPortalProps } from 'reka-ui'
import { ContextMenuPortal } from 'reka-ui'

const props = defineProps<ContextMenuPortalProps>()
</script>

<template>
  <ContextMenuPortal
    data-slot="context-menu-portal"
    v-bind="{ ...props, to: portalTarget }"
  >
    <slot />
  </ContextMenuPortal>
</template>
