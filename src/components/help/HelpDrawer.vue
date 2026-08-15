<script setup lang="ts">
import { useHelp } from '@/composables/useHelp'
import HelpRenderer from './HelpRenderer.vue'

const { visible, currentEntry, close } = useHelp()
</script>

<template>
  <el-drawer
    :model-value="visible"
    size="var(--momo-help-drawer-width)"
    append-to-body
    :z-index="2000"
    @update:model-value="close"
    @close="close"
  >
    <template #header>
      <div class="help-drawer-title">
        <span class="help-drawer-badge">?</span>
        <span class="help-drawer-name">{{ currentEntry?.title ?? '使用帮助' }}</span>
      </div>
    </template>

    <HelpRenderer
      v-if="currentEntry"
      :key="currentEntry.path"
      :path="currentEntry.path"
    />
    <div v-else class="help-drawer-empty">该页面暂未提供帮助文档</div>
  </el-drawer>
</template>

<style scoped>
.help-drawer-title {
  display: flex;
  align-items: center;
  gap: var(--momo-space-2);
  font-size: var(--momo-font-size-lg);
  font-weight: var(--momo-font-weight-semibold);
  color: var(--momo-color-text);
}

.help-drawer-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--momo-space-6);
  height: var(--momo-space-6);
  border-radius: var(--momo-radius-full);
  background: var(--momo-color-brand-subtle);
  color: var(--momo-color-brand);
  font-size: var(--momo-font-size-md);
  font-weight: var(--momo-font-weight-semibold);
}

.help-drawer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.help-drawer-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50%;
  color: var(--momo-color-text-secondary);
  font-size: var(--momo-font-size-base);
}
</style>
