<script setup lang="ts">
interface Props {
  contentPadding?: string
}

const props = withDefaults(defineProps<Props>(), {
  contentPadding: '0'
})
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div v-if="$slots.header || $slots.extra" class="page-header">
        <slot name="header" />
        <div v-if="$slots.extra" class="page-header-extra">
          <slot name="extra" />
        </div>
      </div>

      <div class="page-content" :style="{ padding: contentPadding }">
        <slot />
      </div>

      <div v-if="$slots.footer" class="page-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-card {
  background: var(--el-bg-color);
  border-radius: var(--tf-card-radius, 12px);
  box-shadow: var(--el-box-shadow-light);
  padding: var(--tf-card-padding, 24px);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 16px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-header-extra {
  flex-shrink: 0;
}

.page-content {
  flex: 1;
  overflow: auto;
  animation: fadeIn 0.3s ease-out;
}

.page-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
