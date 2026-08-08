<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  tone?: 'default' | 'info' | 'warning' | 'success' | 'danger'
}>(), {
  description: '',
  tone: 'default',
})
</script>

<template>
  <div class="ui-status-bar" :class="`tone-${tone}`">
    <div class="ui-status-copy">
      <div class="ui-status-title">{{ title }}</div>
      <div v-if="description" class="ui-status-description">{{ description }}</div>
    </div>
    <div v-if="$slots.actions" class="ui-status-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.ui-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  background: var(--el-fill-color-lighter);
}

.ui-status-bar.tone-info {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}

.ui-status-bar.tone-warning {
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
}

.ui-status-bar.tone-success {
  border-color: var(--el-color-success-light-7);
  background: var(--el-color-success-light-9);
}

.ui-status-bar.tone-danger {
  border-color: var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);
}

.ui-status-copy {
  min-width: 0;
}

.ui-status-title {
  color: var(--el-text-color-primary);
  font-size: var(--momo-font-size-base);
  font-weight: 500;
  line-height: 22px;
}

.ui-status-description {
  color: var(--el-text-color-secondary);
  font-size: var(--momo-font-size-sm);
  line-height: 18px;
}

.ui-status-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
</style>
