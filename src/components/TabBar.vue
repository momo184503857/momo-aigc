<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { X } from '@lucide/vue'
import { useTabStore } from '@/stores/tabs'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

const tabStore = useTabStore()
const listEl = ref<HTMLElement | null>(null)

const activeTab = computed(() => tabStore.activeTabId)

function onTabClick(tabId: string) {
  tabStore.setActiveTab(tabId)
  nextTick(() => {
    listEl.value
      ?.querySelector(`[data-id="${tabId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  })
}
</script>

<template>
  <div class="bg-background flex h-(--momo-tabbar-height) shrink-0 items-center border-b px-2">
    <div
      ref="listEl"
      class="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ContextMenu v-for="tab in tabStore.tabs" :key="tab.id">
        <ContextMenuTrigger as-child>
          <div
            :data-id="tab.id"
            :class="cn(
              'group flex h-7 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors select-none',
              tab.id === activeTab
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )"
            @click="onTabClick(tab.id)"
          >
            <component :is="tab.icon" class="size-3.5 shrink-0" />
            <span class="truncate">{{ tab.title }}</span>
            <span
              v-if="tab.closable"
              :class="cn(
                'hover:bg-foreground/10 -mr-1 flex size-4 shrink-0 items-center justify-center rounded-sm transition-opacity',
                tab.id === activeTab ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100',
              )"
              @click.stop="tabStore.removeTab(tab.id)"
            >
              <X class="size-3" />
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-32">
          <ContextMenuItem @select="tabStore.removeTab(tab.id)">
            关闭
          </ContextMenuItem>
          <ContextMenuItem @select="tabStore.removeOtherTabs(tab.id)">
            关闭其他
          </ContextMenuItem>
          <ContextMenuItem @select="tabStore.removeAllClosable()">
            关闭所有
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  </div>
</template>
