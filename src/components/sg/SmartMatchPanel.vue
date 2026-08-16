<template>
  <div class="sg-smart-match">
    <div class="panel-head">
      <span class="title">✨ 智能匹配整套方案</span>
      <div class="head-actions">
        <el-button size="small" @click="emit('re-match')">🎲 随机重匹配</el-button>
      </div>
    </div>
    <div v-if="plans.length === 0" class="empty">上传服装图并勾选特征后点击「智能匹配」获取推荐方案</div>
    <div class="plans">
      <div v-for="plan in plans" :key="plan.track.key" class="plan-col">
        <div class="plan-track">
          <span class="t-name">{{ plan.track.emoji }} {{ plan.track.name }}</span>
          <span class="t-reason" :title="plan.reason.join('、')">{{ plan.reason.slice(0, 2).join('、') }}</span>
        </div>
        <div
          v-for="theme in plan.themes"
          :key="theme.name"
          class="plan-theme"
          :class="{ selected: selectedTrack === plan.track.key && selectedTheme === theme.name }"
          @click="emit('apply', { trackKey: plan.track.key, themeName: theme.name })"
        >
          <div class="p-name">{{ theme.name }}</div>
          <div class="p-path">{{ theme.path }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SgSmartMatchPanel' })

defineProps<{
  plans: Array<{
    track: { key: string; name: string; emoji?: string }
    themes: Array<{ name: string; path: string }>
    reason: string[]
  }>
  selectedTrack?: string | null
  selectedTheme?: string | null
}>()

const emit = defineEmits<{
  'apply': [v: { trackKey: string; themeName: string }]
  're-match': []
}>()
</script>

<style scoped>
.sg-smart-match {
  border: 1px solid var(--momo-color-border-light); border-radius: var(--momo-radius-lg);
  padding: var(--momo-space-4); display: flex; flex-direction: column; gap: var(--momo-space-3);
  background: var(--momo-color-bg);
}
.panel-head { display: flex; align-items: center; justify-content: space-between; }
.title { font-weight: var(--momo-font-weight-semibold); }
.empty { color: var(--momo-color-text-tertiary); font-size: var(--momo-font-size-sm); text-align: center; padding: var(--momo-space-4); }
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--momo-space-3); }
.plan-col { display: flex; flex-direction: column; gap: var(--momo-space-2); }
.plan-track {
  display: flex; flex-direction: column; gap: 2px;
  background: var(--momo-color-bg-soft); border-radius: var(--momo-radius-md);
  padding: var(--momo-space-2) var(--momo-space-3);
}
.t-name { font-weight: var(--momo-font-weight-medium); font-size: var(--momo-font-size-sm); }
.t-reason { font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary); }
.plan-theme {
  border: 1px solid var(--momo-color-border-light); border-radius: var(--momo-radius-md);
  padding: var(--momo-space-2) var(--momo-space-3); cursor: pointer;
  transition: border-color var(--momo-transition-fast);
}
.plan-theme:hover { border-color: var(--momo-color-brand-border); }
.plan-theme.selected { border-color: var(--momo-color-brand); background: var(--momo-color-brand-subtle); }
.p-name { font-size: var(--momo-font-size-sm); font-weight: var(--momo-font-weight-medium); }
.p-path { font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary); }
</style>
