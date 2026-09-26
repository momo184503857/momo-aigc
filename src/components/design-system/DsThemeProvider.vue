<script setup lang="ts">
import { provide, ref, useId } from 'vue'
import { designSystemKey, type ThemeAccent, type ThemeMode } from './context'
import './theme.css'
import { Toaster } from './primitives/sonner'
const props = withDefaults(defineProps<{ mode?: ThemeMode; accent?: ThemeAccent; density?: 'comfortable' | 'compact'; toastId?: string }>(), { mode: 'light', accent: 'orange', density: 'comfortable' })
const portalTarget = ref<HTMLElement>()
const toastId = props.toastId || useId()
provide(designSystemKey, { portalTarget, toastId })
</script>
<template>
  <div class="ds-theme" :class="{ dark: mode === 'dark' }" :data-theme="mode" :data-accent="accent" :data-density="density">
    <slot />
    <Toaster :id="toastId" :theme="mode" position="bottom-right" :close-button="true" />
    <div ref="portalTarget" data-ds-portals />
  </div>
</template>
