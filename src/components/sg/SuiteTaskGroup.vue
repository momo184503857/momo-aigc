<template>
  <div class="sg-suite-task-group">
    <div class="stg-head">
      <div class="stg-title">
        <span class="name">{{ suite.name || `套系 #${suite.id}` }}</span>
        <span class="status-badge" :class="statusClass">{{ statusLabel }}</span>
        <span class="meta">{{ completedCount }}/{{ nTotal }} 张完成<template v-if="failedCount"> · {{ failedCount }} 张失败</template></span>
      </div>
      <div class="stg-actions">
        <el-button size="small" @click="emit('refresh')">刷新</el-button>
        <el-button size="small" @click="emit('rename')">重命名</el-button>
        <el-button size="small" type="primary" plain :disabled="!canRegenerate" @click="emit('regenerate-failed')">重新生成失败点</el-button>
        <el-button size="small" type="primary" :disabled="suite.completedCount === 0" @click="emit('publish')">发布到作品库</el-button>
      </div>
    </div>
    <div class="stg-wall">
      <div v-for="p in suite.points" :key="p.pointIndex" class="stg-cell" :class="p.status" @click="emit('open-task', p.taskId)">
        <img v-if="p.resultUrl" :src="p.resultUrl" :alt="`点位${p.pointIndex + 1}`" loading="lazy">
        <div v-else class="placeholder">
          <span>{{ p.pointIndex + 1 }}</span>
          <span class="p-status">{{ statusOf(p.status) }}</span>
        </div>
        <div class="cell-tag">P{{ p.pointIndex + 1 }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SgSuite } from '@/services/sgApi'

defineOptions({ name: 'SgSuiteTaskGroup' })

const props = defineProps<{ suite: SgSuite }>()

const emit = defineEmits<{
  refresh: []
  rename: []
  'regenerate-failed': []
  publish: []
  'open-task': [taskId: number | null]
}>()

const nTotal = computed(() => props.suite.points.length || props.suite.n_total || 5)
const completedCount = computed(() => props.suite.points.filter((p) => p.status === 'completed').length)
const failedCount = computed(() => props.suite.points.filter((p) => p.status === 'failed').length)
const canRegenerate = computed(() =>
  props.suite.points.some((p) => p.status === 'failed' || p.status === 'pending'),
)

const STATUS_MAP: Record<string, string> = {
  draft: '草稿', generating: '生成中', partial: '部分完成', completed: '已完成', failed: '失败', archived: '已归档',
}
const statusLabel = computed(() => STATUS_MAP[props.suite.status] || props.suite.status)
const statusClass = computed(() => {
  switch (props.suite.status) {
    case 'completed': return 'done'
    case 'generating': return 'running'
    case 'failed': return 'rejected'
    default: return 'pending'
  }
})

function statusOf(s: string) {
  const m: Record<string, string> = {
    pending: '待生成', submitted: '排队中', queued: '排队中', in_progress: '生成中',
    completed: '已完成', failed: '失败',
  }
  return m[s] || s
}
</script>

<style scoped>
.sg-suite-task-group {
  border: 1px solid var(--momo-color-border-light); border-radius: var(--momo-radius-lg);
  padding: var(--momo-space-4); display: flex; flex-direction: column; gap: var(--momo-space-3);
  background: var(--momo-color-bg);
}
.stg-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--momo-space-2); }
.stg-title { display: flex; align-items: center; gap: var(--momo-space-2); }
.name { font-weight: var(--momo-font-weight-semibold); }
.status-badge { font-size: var(--momo-font-size-xs); padding: 0 var(--momo-space-2); border-radius: var(--momo-radius-full); line-height: 20px; }
.status-badge.done { color: var(--momo-color-status-done-text); background: var(--momo-color-status-done-bg); }
.status-badge.running { color: var(--momo-color-status-running-text); background: var(--momo-color-status-running-bg); }
.status-badge.rejected { color: var(--momo-color-status-rejected-text); background: var(--momo-color-status-rejected-bg); }
.status-badge.pending { color: var(--momo-color-status-pending-text); background: var(--momo-color-status-pending-bg); }
.meta { font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary); }
.stg-actions { display: flex; gap: var(--momo-space-2); flex-wrap: wrap; }
.stg-wall { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--momo-space-2); }
.stg-cell {
  position: relative; aspect-ratio: 3/4; border-radius: var(--momo-radius-md); overflow: hidden;
  border: 1px solid var(--momo-color-border-light); cursor: pointer; background: var(--momo-color-bg-soft);
}
.stg-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.stg-cell .placeholder {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--momo-space-1); color: var(--momo-color-text-tertiary);
}
.stg-cell .placeholder span:first-child { font-size: var(--momo-font-size-xl); font-weight: var(--momo-font-weight-bold); }
.p-status { font-size: var(--momo-font-size-xs); }
.stg-cell.failed { border-color: var(--momo-color-danger); }
.cell-tag {
  position: absolute; left: 0; top: 0; background: var(--momo-overlay-dim); color: var(--momo-overlay-text);
  font-size: var(--momo-font-size-xs); padding: 0 6px; border-radius: 0 0 var(--momo-radius-sm) 0;
}
</style>
