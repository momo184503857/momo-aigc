<script setup lang="ts">
import { Aperture } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../primitives/card'
withDefaults(defineProps<{ title?: string; subtitle: string }>(), { title: '墨墨 AI 生图' })
</script>

<template>
  <div class="ds-auth-shell">
    <Card class="ds-auth-panel">
      <CardHeader class="ds-auth-heading">
        <span class="ds-auth-mark"><Aperture aria-hidden="true" /></span>
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription>{{ subtitle }}</CardDescription>
      </CardHeader>
      <CardContent><slot /></CardContent>
    </Card>
  </div>
</template>
