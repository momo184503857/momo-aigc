<script setup lang="ts">
import { ref, watch } from 'vue'
import { ImageOff } from '@lucide/vue'
import { thumbnailUrl, localThumbnail } from '@/utils/imageDisplay'
const props = withDefaults(defineProps<{ src?: string; alt?: string; loading?: 'lazy' | 'eager' }>(), { alt: '', loading: 'lazy' })
const resolved = ref<string>()
const failed = ref(false)
const attempt = ref(0)
watch([() => props.src, attempt], async ([source], _old, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  failed.value = false
  resolved.value = undefined
  if (!source) { failed.value = true; return }
  try {
    const url = /^(blob:|data:image\/)/.test(source)
      ? await localThumbnail(source)
      : thumbnailUrl(source, window.location.origin)
    if (!cancelled) { resolved.value = url; failed.value = !url }
  } catch { if (!cancelled) failed.value = true }
}, { immediate: true })
// 不发出 error 让旧页面的重试器把 src 改回原图；失败只能重试同一缩略图。
</script>
<template>
  <img v-if="resolved && !failed" :key="attempt" :src="resolved" :alt="alt" :loading="loading" decoding="async" data-thumbnail="400" @error="failed = true" />
  <span v-else class="ds-thumbnail-placeholder" :aria-label="alt || '图片缩略图'" :aria-busy="!failed" data-thumbnail="400">
    <ImageOff v-if="failed" aria-hidden="true" />
    <span v-if="!failed" role="status">加载中</span>
    <!-- 可嵌入已有预览按钮，避免嵌套 button；点击占位仍交给父级打开原图。 -->
    <span v-else role="button" tabindex="0" class="ds-thumbnail-retry" aria-label="重试缩略图" @click.stop="attempt++" @keydown.enter.stop.prevent="attempt++" @keydown.space.stop.prevent="attempt++">重试</span>
  </span>
</template>
