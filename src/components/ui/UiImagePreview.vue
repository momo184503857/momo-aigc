<script setup lang="ts">
/**
 * UiImagePreview — 图片弹窗预览组件
 * 使用方法：
 *   <UiImagePreview v-model="visible" :url="imageUrl" />
 *   或通过 composable: const { open, visible, url } = useImagePreview()
 */
import { watch, onUnmounted } from 'vue'

interface Props {
  modelValue: boolean
  url: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function close() {
  emit('update:modelValue', false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}

// 全局监听 ESC
let listener: ((e: KeyboardEvent) => void) | null = null
watch(() => props.modelValue, (v) => {
  if (v) {
    listener = onKeydown
    window.addEventListener('keydown', listener)
  } else if (listener) {
    window.removeEventListener('keydown', listener)
    listener = null
  }
})

onUnmounted(() => {
  if (listener) window.removeEventListener('keydown', listener)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="preview-fade">
      <div v-if="modelValue && url" class="ui-preview-overlay" @click="close">
        <div class="ui-preview-close" @click.stop="close">
          <el-icon :size="20"><Close /></el-icon>
        </div>
        <img :src="url" class="ui-preview-image" @click.stop />
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
import { Close } from '@element-plus/icons-vue'
</script>

<style scoped>
.ui-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}

.ui-preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  transition: background 0.2s;
  z-index: 1;
}
.ui-preview-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.ui-preview-image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  cursor: default;
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}
.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
