<script lang="ts">
export interface Crumb {
  title: string
  /** 传入则可点击跳转；最后一级不传，渲染为当前页 */
  to?: string
}
</script>

<script setup lang="ts">
import AppearanceSettings from './AppearanceSettings.vue'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/design-system/primitives/breadcrumb'
import { Separator } from '@/components/design-system/primitives/separator'
import { SidebarTrigger } from '@/components/design-system/primitives/sidebar'

defineProps<{
  crumbs: Crumb[]
}>()
</script>

<template>
  <header
    class="bg-card flex h-(--ds-header-height) shrink-0 items-center gap-2 border-b px-4"
  >
    <SidebarTrigger class="-ml-1" />
    <Separator orientation="vertical" class="mr-1 h-4" />

    <Breadcrumb v-if="crumbs.length">
      <BreadcrumbList>
        <template v-for="(crumb, index) in crumbs" :key="crumb.title">
          <BreadcrumbSeparator v-if="index > 0" />
          <BreadcrumbItem>
            <BreadcrumbLink v-if="crumb.to" :href="`#${crumb.to}`">
              {{ crumb.title }}
            </BreadcrumbLink>
            <BreadcrumbPage v-else>{{ crumb.title }}</BreadcrumbPage>
          </BreadcrumbItem>
        </template>
      </BreadcrumbList>
    </Breadcrumb>

    <div class="ml-auto flex items-center gap-2">
      <slot name="actions" />
      <AppearanceSettings />
    </div>
  </header>
</template>
