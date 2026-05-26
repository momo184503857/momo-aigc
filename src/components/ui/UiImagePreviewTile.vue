<script setup lang="ts">
import { Loading, Picture, ZoomIn } from '@element-plus/icons-vue'

withDefaults(defineProps<{
  src?: string
  alt?: string
  loading?: boolean
  clickable?: boolean
  selected?: boolean
  emptyText?: string
}>(), {
  src: '',
  alt: '',
  loading: false,
  clickable: true,
  selected: false,
  emptyText: '暂无图片',
})

const emit = defineEmits<{
  preview: []
}>()
</script>

<template>
  <button
    class="ui-image-tile"
    :class="{ clickable, selected }"
    type="button"
    :disabled="!clickable || (!src && !loading)"
    @click="clickable && src && emit('preview')"
  >
    <img v-if="src" :src="src" :alt="alt" draggable="false" />
    <span v-else-if="loading" class="ui-image-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>生成中</span>
    </span>
    <span v-else class="ui-image-state">
      <el-icon><Picture /></el-icon>
      <span>{{ emptyText }}</span>
    </span>

    <span v-if="src && clickable" class="ui-image-overlay">
      <el-icon><ZoomIn /></el-icon>
      <span>查看大图</span>
    </span>
  </button>
</template>

<style scoped>
.ui-image-tile {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--tf-radius-md, 8px);
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-placeholder);
}

.ui-image-tile.clickable {
  cursor: pointer;
}

.ui-image-tile:disabled {
  cursor: default;
}

.ui-image-tile.selected {
  box-shadow: 0 0 0 2px var(--el-color-primary);
}

.ui-image-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ui-image-state {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: var(--momo-font-size-sm);
  line-height: 18px;
}

.ui-image-state .el-icon {
  font-size: 28px;
}

.ui-image-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--momo-color-text-inverse);
  font-size: var(--momo-font-size-sm);
  font-weight: 500;
  background: var(--momo-color-overlay);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ui-image-tile.clickable:hover .ui-image-overlay {
  opacity: 1;
}
</style>
