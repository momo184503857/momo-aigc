<script setup lang="ts">
import { inject } from 'vue'
import { designSystemKey } from '@/components/design-system/context'
import { DsThemeProvider, TooltipProvider } from '@/components/design-system'
import { useAppearanceStore } from '@/stores/appearance'
import FeedbackHost from './FeedbackHost.vue'
import '@/styles/legacy-surface.css'
const appearance = useAppearanceStore()
const parentTheme = inject(designSystemKey, null)
</script>
<template><slot v-if="parentTheme" /><DsThemeProvider v-else class="application-theme" :mode="appearance.mode" :density="appearance.density" toast-id="momo-application"><TooltipProvider><slot /><FeedbackHost /></TooltipProvider></DsThemeProvider></template>
