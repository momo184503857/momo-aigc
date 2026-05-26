<script setup lang="ts">
defineOptions({ name: 'FeatureNav' })

export interface TabItem {
  id: string
  label: string
}

export interface TabGroup {
  name: string
  tabs: TabItem[]
}

defineProps<{
  groups: TabGroup[]
  activeTab: string
}>()

const emit = defineEmits<{
  select: [tabId: string]
}>()
</script>

<template>
  <div class="feature-nav">
    <div class="nav-header">功能导航</div>
    <div class="nav-groups">
      <div v-for="group in groups" :key="group.name" class="nav-group">
        <div class="group-title">{{ group.name }}</div>
        <div
          v-for="tab in group.tabs"
          :key="tab.id"
          class="nav-tab"
          :class="{ active: activeTab === tab.id }"
          @click="emit('select', tab.id)"
        >
          {{ tab.label }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feature-nav {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
  border-right: 1px solid var(--el-border-color-lighter);
}

.nav-header {
  padding: 16px 16px 12px;
  font-size: var(--momo-font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.nav-groups {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.nav-group {
  margin-bottom: 4px;
}

.group-title {
  padding: 8px 16px 4px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}

.nav-tab {
  padding: 8px 16px 8px 24px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.15s;
  border-left: 2px solid transparent;
}

.nav-tab:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.nav-tab.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-left-color: var(--el-color-primary);
  font-weight: 500;
}
</style>
