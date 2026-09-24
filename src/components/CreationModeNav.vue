<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/design-system'
import { creationModes, isCreationPath } from '@/configs/navigation'
const route = useRoute()
const router = useRouter()
</script>
<template><nav v-if="isCreationPath(route.path)" class="ds-mode-nav" aria-label="创作模式"><Button v-for="mode in creationModes" :key="mode.path" :variant="route.path === mode.path || route.path.startsWith(mode.path + '/') ? 'secondary' : 'ghost'" :aria-current="route.path === mode.path || route.path.startsWith(mode.path + '/') ? 'page' : undefined" @click="router.push(mode.path)"><component :is="mode.icon" />{{ mode.title }}</Button></nav></template>
