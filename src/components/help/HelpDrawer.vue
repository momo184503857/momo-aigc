<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { useHelp } from '@/composables/useHelp'
import HelpRenderer from './HelpRenderer.vue'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const { visible, currentEntry, close } = useHelp()

function onOpenChange(open: boolean) {
  if (!open) close()
}
</script>

<template>
  <Sheet :open="visible" @update:open="onOpenChange">
    <SheetContent
      side="right"
      class="w-(--momo-help-drawer-width) gap-0 p-0 sm:max-w-(--momo-help-drawer-width)"
    >
      <SheetHeader class="border-b px-5 py-4 text-left">
        <SheetTitle class="flex items-center gap-2 text-base">
          <span
            class="bg-accent text-accent-foreground flex size-6 shrink-0 items-center justify-center rounded-full"
          >
            <CircleHelp class="size-3.5" />
          </span>
          <span class="truncate">{{ currentEntry?.title ?? '使用帮助' }}</span>
        </SheetTitle>
        <SheetDescription class="sr-only">
          当前页面的使用帮助文档
        </SheetDescription>
      </SheetHeader>

      <div class="flex-1 overflow-auto px-5 py-4">
        <HelpRenderer
          v-if="currentEntry"
          :key="currentEntry.path"
          :path="currentEntry.path"
        />
        <div
          v-else
          class="text-muted-foreground flex min-h-40 items-center justify-center text-sm"
        >
          该页面暂未提供帮助文档
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
