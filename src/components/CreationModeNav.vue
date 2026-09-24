<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DsNavigationDock } from '@/components/design-system'
import { creationModes, isCreationPath, assetTabs, isAssetPath } from '@/configs/navigation'
const route = useRoute()
const router = useRouter()
const inCreation = computed(() => isCreationPath(route.path))
const inAssets = computed(() => isAssetPath(route.path))
const items = computed(() => inCreation.value
  ? creationModes.map(item => ({ ...item, active: route.path === item.path || route.path.startsWith(item.path + '/') }))
  : assetTabs.map(item => ({ ...item, active: route.path === item.path || route.path === item.legacyPath })))
</script>
<template>
  <div v-if="inCreation || inAssets" class="ds-section-nav">
    <DsNavigationDock :items="items" orientation="horizontal" :label="inCreation ? '创作模式' : '资产分类'" @navigate="router.push($event)" />
  </div>
</template>
