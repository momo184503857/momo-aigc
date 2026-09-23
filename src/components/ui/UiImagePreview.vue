<script setup lang="ts">
/**
 * UiImagePreview — 全屏图片预览遮罩
 * 使用方法：
 *   <UiImagePreview v-model="visible" :url="imageUrl" />        单图
 *   <UiImagePreview v-model="visible" :url="imageUrlList" />    组图（←/→ 翻页）
 *   或通过 composable: const { open, visible, url } = useImagePreview()
 */
import { computed, ref, watch, onUnmounted } from 'vue'
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'

interface Props {
  modelValue: boolean
  url: string | string[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const list = computed(() =>
  Array.isArray(props.url) ? props.url.filter(Boolean) : props.url ? [props.url] : [],
)
const index = ref(0)
const current = computed(() => list.value[Math.min(index.value, list.value.length - 1)] ?? '')
const paged = computed(() => list.value.length > 1)

function close() {
  emit('update:modelValue', false)
}

function step(delta: number) {
  const n = list.value.length
  if (n < 2) return
  index.value = (index.value + delta + n) % n
}

function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowLeft') step(-1)
  else if (e.key === 'ArrowRight') step(1)
}

// 全局监听 ESC / 方向键
let listener: ((e: KeyboardEvent) => void) | null = null
watch(() => props.modelValue, (v) => {
  if (v) {
    index.value = 0
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
      <div
        v-if="modelValue && current"
        class="bg-(--momo-overlay-bg) fixed inset-0 z-[9999] flex cursor-zoom-out items-center justify-center"
        @click="close"
      >
        <button
          type="button"
          class="text-(--momo-overlay-text) absolute top-4 right-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30"
          @click.stop="close"
        >
          <X class="size-5" />
        </button>

        <button
          v-if="paged"
          type="button"
          class="text-(--momo-overlay-text) absolute left-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30"
          title="上一张（←）"
          @click.stop="step(-1)"
        >
          <ChevronLeft class="size-5" />
        </button>
        <button
          v-if="paged"
          type="button"
          class="text-(--momo-overlay-text) absolute right-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30"
          title="下一张（→）"
          @click.stop="step(1)"
        >
          <ChevronRight class="size-5" />
        </button>

        <img
          :src="current"
          class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-lg"
          @click.stop
        />

        <div
          v-if="paged"
          class="text-(--momo-overlay-text) absolute bottom-5 left-1/2 -translate-x-1/2 text-[13px] tabular-nums"
        >{{ index + 1 }} / {{ list.length }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}
.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
