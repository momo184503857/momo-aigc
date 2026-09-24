<script setup lang="ts">
import { Info } from '@lucide/vue'
import { Alert, AlertTitle } from '@/components/design-system/primitives/alert'
</script>

<template>
  <Alert>
    <Info />
    <AlertTitle>该节点暂无可配置项。</AlertTitle>
  </Alert>
</template>
