<script setup lang="ts">
import { DsSearchInput } from '@/components/design-system'
import { Button } from '@/components/design-system'
import { computed, ref, type Component } from 'vue'
import {
  Blocks,
  Crosshair,
  LayoutGrid,
  LayoutTemplate,
  Paintbrush,
  PictureInPicture2,
  Scissors,
  Search,
  User,
  X,
  ZoomIn,
} from '@lucide/vue'
import { cn } from '@/lib/utils'
import { Input } from '@/components/design-system/primitives/input'

defineOptions({ name: 'FeatureNav' })

export interface TabItem {
  id: string
  label: string
  hint?: string
}

export interface TabGroup {
  name: string
  tabs: TabItem[]
}

const props = defineProps<{
  groups: TabGroup[]
  activeTab: string
}>()

const emit = defineEmits<{
  select: [tabId: string]
}>()

// 仅 UI：图标与搜索关键字都属于视图层，不影响功能路由
const ICONS: Record<string, Component> = {
  'change-clothes': Paintbrush,
  'change-bg': PictureInPicture2,
  'change-face': Crosshair,
  'detail-pic': ZoomIn,
  'fabric-pic': Scissors,
  'flat-pic': LayoutTemplate,
  '3d-pic': Blocks,
  'model-gen': User,
  'three-view': LayoutGrid,
}

const keyword = ref('')

const filteredGroups = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return props.groups
  return props.groups
    .map(g => ({
      ...g,
      tabs: g.tabs.filter(t => t.label.toLowerCase().includes(q) || t.id.includes(q)),
    }))
    .filter(g => g.tabs.length > 0)
})

function select(tabId: string) {
  keyword.value = ''
  emit('select', tabId)
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-muted/40">
    <div class="relative shrink-0 p-2 pb-1">

      <DsSearchInput :clearable="false"
        v-model="keyword"
        placeholder="搜索功能"
        aria-label="搜索功能"

      />
      <Button variant="ghost"
        v-if="keyword"
        type="button"
        aria-label="清除搜索"
        class="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer"
        @click="keyword = ''"
      >
        <X class="size-3.5" />
      </Button>
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="功能导航">
      <div v-for="group in filteredGroups" :key="group.name" class="mt-3 first:mt-1.5">
        <p class="text-muted-foreground px-2 pb-1 text-sm font-medium tracking-wider uppercase">
          {{ group.name }}
        </p>
        <ul class="space-y-px">
          <li v-for="tab in group.tabs" :key="tab.id">
            <Button :variant="activeTab === tab.id ? 'secondary' : 'ghost'"
              type="button"
              :aria-current="activeTab === tab.id ? 'page' : undefined"
              class="w-full justify-start gap-2"
              @click="select(tab.id)"
            >
              <component
                :is="ICONS[tab.id] || LayoutGrid"
                :class="cn('size-4 shrink-0', activeTab === tab.id && 'text-foreground')"
              />
              <span class="truncate">{{ tab.label }}</span>
              <span v-if="tab.hint" class="text-muted-foreground/80 ml-auto shrink-0 text-sm tabular-nums">
                {{ tab.hint }}
              </span>
            </Button>
          </li>
        </ul>
      </div>

      <p v-if="filteredGroups.length === 0" class="text-muted-foreground px-2 py-8 text-center text-sm">
        没有匹配「{{ keyword }}」的功能
      </p>
    </nav>
  </div>
</template>
