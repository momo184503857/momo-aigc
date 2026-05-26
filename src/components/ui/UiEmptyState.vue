<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  imageSize?: number
}>(), {
  description: '',
  imageSize: 64,
})
</script>

<template>
  <el-empty :image-size="imageSize" class="ui-empty-state">
    <template #description>
      <div class="ui-empty-title">{{ title }}</div>
      <div v-if="description" class="ui-empty-description">{{ description }}</div>
    </template>
    <slot />
  </el-empty>
</template>

<style scoped>
.ui-empty-state {
  padding: 32px 16px;
}

.ui-empty-title {
  color: var(--el-text-color-regular);
  font-size: var(--momo-font-size-base);
  line-height: 22px;
}

.ui-empty-description {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: var(--momo-font-size-sm);
  line-height: 18px;
}
</style>
