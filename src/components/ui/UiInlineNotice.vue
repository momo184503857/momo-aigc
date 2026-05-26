<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  type?: 'success' | 'warning' | 'info' | 'error'
  description?: string
  closable?: boolean
}>(), {
  type: 'info',
  description: '',
  closable: false,
})
</script>

<template>
  <el-alert
    class="ui-inline-notice"
    :title="title"
    :type="type"
    :description="description"
    :closable="closable"
    show-icon
  >
    <slot />
  </el-alert>
</template>

<style scoped>
.ui-inline-notice {
  margin-bottom: 16px;
  border-radius: var(--tf-radius-md, 8px);
}
</style>
