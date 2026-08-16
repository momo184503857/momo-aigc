<template>
  <div class="sg-theme-card" :class="{ selected }">
    <div class="tc-head">
      <span class="tc-name">{{ theme.name }}</span>
      <span class="tc-badges">
        <span v-if="theme.isGlobal" class="badge global">通用</span>
        <span v-else class="badge mine">我的</span>
        <span class="badge season">{{ seasonLabel }}</span>
      </span>
    </div>
    <div class="tc-path">{{ theme.path }}</div>
    <div class="tc-points">
      <div v-for="(p, i) in theme.points" :key="i" class="tc-point">
        <span class="dot">{{ i + 1 }}</span>
        <span class="txt" :title="p">{{ p }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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

<style scoped>
.sg-theme-card {
  border: 1px solid var(--momo-color-border-light); border-radius: var(--momo-radius-lg);
  padding: var(--momo-space-3) var(--momo-space-4); background: var(--momo-color-bg);
  display: flex; flex-direction: column; gap: var(--momo-space-2);
  transition: border-color var(--momo-transition-fast), box-shadow var(--momo-transition-fast);
}
.sg-theme-card.selected { border-color: var(--momo-color-brand); box-shadow: var(--momo-shadow-brand); }
.tc-head { display: flex; align-items: center; justify-content: space-between; gap: var(--momo-space-2); }
.tc-name { font-weight: var(--momo-font-weight-semibold); font-size: var(--momo-font-size-base); }
.tc-badges { display: flex; gap: var(--momo-space-1); flex-shrink: 0; }
.badge {
  font-size: var(--momo-font-size-xs); padding: 0 var(--momo-space-2); border-radius: var(--momo-radius-full);
  line-height: 18px;
}
.badge.global { color: var(--momo-color-brand); background: var(--momo-color-brand-subtle); }
.badge.mine { color: var(--momo-color-success-antd); background: var(--momo-color-success-subtle); }
.badge.season { color: var(--momo-color-text-tertiary); background: var(--momo-color-bg-muted); }
.tc-path { color: var(--momo-color-text-secondary); font-size: var(--momo-font-size-sm); }
.tc-points { display: flex; flex-direction: column; gap: 2px; }
.tc-point { display: flex; align-items: center; gap: var(--momo-space-2); font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary); }
.tc-point .dot {
  width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
  background: var(--momo-color-bg-muted); color: var(--momo-color-text-secondary);
  display: inline-flex; align-items: center; justify-content: center; font-size: 10px;
}
.tc-point .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
