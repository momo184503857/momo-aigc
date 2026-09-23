<script setup lang="ts">
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
import { Input } from '@/components/ui/input'

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
      <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2" />
      <Input
        v-model="keyword"
        placeholder="搜索功能"
        aria-label="搜索功能"
        class="h-8 rounded-md bg-background pr-7 pl-8 text-[13px]"
      />
      <button
        v-if="keyword"
        type="button"
        aria-label="清除搜索"
        class="text-muted-foreground hover:text-foreground absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer"
        @click="keyword = ''"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="功能导航">
      <div v-for="group in filteredGroups" :key="group.name" class="mt-3 first:mt-1.5">
        <p class="text-muted-foreground px-2 pb-1 text-[11px] font-medium tracking-wider uppercase">
          {{ group.name }}
        </p>
        <ul class="space-y-px">
          <li v-for="tab in group.tabs" :key="tab.id">
            <button
              type="button"
              :aria-current="activeTab === tab.id ? 'page' : undefined"
              :class="cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                activeTab === tab.id
                  ? 'bg-background text-foreground font-medium shadow-xs ring-1 ring-border/60'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )"
              @click="select(tab.id)"
            >
              <component
                :is="ICONS[tab.id] || LayoutGrid"
                :class="cn('size-4 shrink-0', activeTab === tab.id && 'text-foreground')"
              />
              <span class="truncate">{{ tab.label }}</span>
              <span v-if="tab.hint" class="text-muted-foreground/80 ml-auto shrink-0 text-[11px] tabular-nums">
                {{ tab.hint }}
              </span>
            </button>
          </li>
        </ul>
      </div>

      <p v-if="filteredGroups.length === 0" class="text-muted-foreground px-2 py-8 text-center text-[13px]">
        没有匹配「{{ keyword }}」的功能
      </p>
    </nav>
  </div>
</template>
