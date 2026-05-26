<script setup lang="ts">
import { computed } from 'vue'

type TagType = 'success' | 'warning' | 'info' | 'primary' | 'danger'

const props = withDefaults(defineProps<{
  status: string
  detail?: string
  size?: 'small' | 'default' | 'large'
}>(), {
  detail: '',
  size: 'small',
})

const statusMeta = computed<{ text: string; type: TagType }>(() => {
  const map: Record<string, { text: string; type: TagType }> = {
    submitted: { text: '已提交', type: 'info' },
    queued: { text: '排队中', type: 'warning' },
    in_progress: { text: '生成中', type: 'warning' },
    completed: { text: '已完成', type: 'success' },
    failed: { text: '生成失败', type: 'danger' },
    unknown: { text: '状态未知', type: 'info' },
    active: { text: '启用', type: 'success' },
    disabled: { text: '禁用', type: 'danger' },
  }
  return map[props.status] || { text: props.status || '状态未知', type: 'info' }
})
</script>

<template>
  <span class="ui-status-badge">
    <el-tag :type="statusMeta.type" :size="size" effect="light">
      {{ statusMeta.text }}
    </el-tag>
    <span v-if="detail" class="ui-status-detail" :class="{ danger: status === 'failed' }">
      {{ detail }}
    </span>
  </span>
</template>

<style scoped>
.ui-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ui-status-detail {
  min-width: 0;
  color: var(--el-text-color-secondary);
  font-size: var(--momo-font-size-sm);
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-status-detail.danger {
  color: var(--el-color-danger);
}
</style>
