<script setup lang="ts">
import { Alert, AlertTitle, AlertDescription } from '../primitives/alert'
defineProps<{ title: string; description?: string; error?: boolean }>()
</script>
<template><Alert :variant="error ? 'destructive' : 'default'"><AlertTitle>{{ title }}</AlertTitle><AlertDescription>{{ description }}<slot /></AlertDescription></Alert></template>
