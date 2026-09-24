<script setup lang="ts">
import { computed } from 'vue'
import { Clock3, ListTodo, LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/design-system/primitives/button'
import { useTaskManager } from '@/composables/useTaskManager'
import { useTaskPanelStore } from '@/stores/taskPanel'

const taskPanel = useTaskPanelStore()
const tm = useTaskManager()

const pendingCount = computed(() => Math.max(tm.taskSummary.value.active, tm.activeTaskCount.value))
const stage = computed(() => {
  const summary = tm.taskSummary.value
  if (!pendingCount.value) return { key: 'idle', label: '暂无待完成' }
  if (summary.importing > 0 || tm.tasks.value.some(t => t.status === 'importing')) {
    return { key: 'importing', label: '结果处理中' }
  }
  if (summary.generating > 0 || tm.tasks.value.some(t => t.status === 'in_progress')) {
    return { key: 'generating', label: '生成中' }
  }
  return { key: 'queued', label: '排队中' }
})

function togglePanel() {
  if (taskPanel.isCollapsed) taskPanel.togglePanel()
  else taskPanel.collapse()
}
</script>

<template>
  <div class="task-dock-card">
    <Button
      type="button"
      variant="ghost"
      class="task-dock-trigger"
      :aria-label="`${taskPanel.isCollapsed ? '打开' : '收起'}任务面板，${pendingCount ? `待完成 ${pendingCount} 个` : '暂无待完成任务'}`"
      :aria-expanded="!taskPanel.isCollapsed"
      :data-active="pendingCount > 0"
      :data-open="!taskPanel.isCollapsed"
      @click="togglePanel"
    >
      <span class="task-dock-icon" :class="{ 'task-dock-icon-active': pendingCount > 0 }">
        <Clock3 v-if="stage.key === 'queued'" class="size-6" aria-hidden="true" />
        <LoaderCircle v-else-if="pendingCount > 0" class="size-6 animate-spin" aria-hidden="true" />
        <ListTodo v-else class="size-6" aria-hidden="true" />
        <span v-if="pendingCount > 0" class="task-dock-pulse" aria-hidden="true" />
      </span>
      <span class="task-dock-title">任务面板</span>
      <Transition name="task-dock-status" mode="out-in">
        <span :key="stage.key" class="task-dock-status" aria-live="polite">{{ stage.label }}</span>
      </Transition>
      <Transition name="task-dock-count">
        <span v-if="pendingCount > 0" class="task-dock-count" aria-hidden="true">{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
      </Transition>
    </Button>
  </div>
</template>

<style scoped>
.task-dock-card {
  width: 100%;
  padding: var(--ds-space-2);
  border: 1px solid var(--border);
  border-radius: calc(var(--ds-radius) * 2);
  background: var(--card);
  box-shadow: var(--ds-shadow);
}
.task-dock-card .task-dock-trigger {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: auto;
  min-height: 104px;
  gap: var(--ds-space-1);
  padding: var(--ds-space-2) var(--ds-space-1);
  color: var(--muted-foreground);
  white-space: normal;
}
.task-dock-card .task-dock-trigger:hover,
.task-dock-card .task-dock-trigger[data-open='true'] {
  background: var(--accent);
  color: var(--accent-foreground);
}
.task-dock-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}
.task-dock-icon-active { color: var(--foreground); }
.task-dock-pulse {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--card);
  animation: task-dock-pulse 1.6s ease-in-out infinite;
}
.task-dock-title { color: var(--foreground); font-size: var(--ds-font-small); font-weight: 600; }
.task-dock-status { font-size: 10px; line-height: 1.2; white-space: nowrap; }
.task-dock-count {
  position: absolute;
  top: 3px;
  right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding-inline: 3px;
  border-radius: 999px;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.task-dock-status-enter-active, .task-dock-status-leave-active,
.task-dock-count-enter-active, .task-dock-count-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.task-dock-status-enter-from, .task-dock-status-leave-to { opacity: 0; transform: translateY(4px); }
.task-dock-count-enter-from, .task-dock-count-leave-to { opacity: 0; transform: scale(.7); }
@keyframes task-dock-pulse { 50% { opacity: .45; transform: scale(.75); } }
@media (max-width: 767px) {
  .task-dock-card { padding: var(--ds-space-1); }
  .task-dock-card .task-dock-trigger { min-height: 92px; padding-inline: 0; }
  .task-dock-title { font-size: 10px; }
  .task-dock-status { font-size: 9px; }
}
@media (prefers-reduced-motion: reduce) {
  .task-dock-pulse { animation: none; }
  .task-dock-status-enter-active, .task-dock-status-leave-active,
  .task-dock-count-enter-active, .task-dock-count-leave-active { transition: none; }
}
</style>
