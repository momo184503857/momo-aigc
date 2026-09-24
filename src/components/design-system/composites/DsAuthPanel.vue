<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../primitives/card'
import DsBrandLogo from './DsBrandLogo.vue'
withDefaults(defineProps<{ title?: string; subtitle: string }>(), { title: '墨墨 AI 生图' })
</script>

<template>
  <div class="ds-auth-shell">
    <Card class="ds-auth-panel">
      <CardHeader class="ds-auth-heading">
        <DsBrandLogo mark-only />
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription>{{ subtitle }}</CardDescription>
      </CardHeader>
      <CardContent><slot /></CardContent>
    </Card>
  </div>
</template>
