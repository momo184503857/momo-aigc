<template>
  <div
    class="flex flex-col gap-2 rounded-lg border bg-background px-4 py-3 transition-[border-color,box-shadow]"
    :class="selected
      ? 'border-primary shadow-(--momo-shadow-brand)'
      : 'border-(--momo-color-border-light)'"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-base font-semibold">{{ theme.name }}</span>
      <span class="flex shrink-0 gap-1">
        <Badge v-if="theme.isGlobal" class="bg-(--momo-color-brand-subtle) text-primary">通用</Badge>
        <Badge v-else variant="success">我的</Badge>
        <Badge variant="secondary">{{ seasonLabel }}</Badge>
      </span>
    </div>
    <div class="text-sm text-(--momo-color-text-secondary)">{{ theme.path }}</div>
    <div class="flex flex-col gap-0.5">
      <div v-for="(p, i) in theme.points" :key="i" class="text-muted-foreground flex items-center gap-2 text-xs">
        <span class="bg-muted flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] text-(--momo-color-text-secondary)">{{ i + 1 }}</span>
        <span class="truncate" :title="p">{{ p }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { SgTheme } from '@/services/sgApi'

defineOptions({ name: 'SgThemeCard' })

const props = defineProps<{ theme: SgTheme; selected?: boolean }>()

const SEASON_MAP: Record<string, string> = { ss: '春夏', aw: '秋冬', all: '全季' }
const seasonLabel = computed(() => {
  const s = props.theme.season as string | string[] | undefined
  if (Array.isArray(s)) return s.length ? s.join('、') : '全季'
  return SEASON_MAP[String(s)] || String(s || '全季')
})
</script>
