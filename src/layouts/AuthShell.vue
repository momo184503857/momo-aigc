<script setup lang="ts">
import { DsAuthPanel } from '@/components/design-system'
defineProps<{ subtitle: string }>()
</script>
<template><DsAuthPanel :subtitle="subtitle"><slot /></DsAuthPanel></template>
