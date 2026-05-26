<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { TaskItem } from './TaskList.vue'
import { MODELS } from '@/types/adapter'

const props = defineProps<{
  tasks: TaskItem[]
  modelValue: boolean
  initialIndex?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const currentIndex = ref(0)
const activeRefIndex = ref(0)
const activeResultIndex = ref(0)

// Zoom/pan state
const refScale = ref(1)
const refTranslate = ref({ x: 0, y: 0 })
const resultScale = ref(1)
const resultTranslate = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0, tx: 0, ty: 0 })
const currentZoomTarget = ref<'ref' | 'result'>('ref')

const currentTask = computed(() => {
  if (currentIndex.value >= 0 && currentIndex.value < props.tasks.length) {
    return props.tasks[currentIndex.value]
  }
  return null
})

const refImages = computed(() => currentTask.value?.input_image_urls || [])
const resultImages = computed(() => currentTask.value?.result_image_urls || [])

function modelDisplayName(modelId: string): string {
  const m = MODELS.find((m) => m.id === modelId)
  return m?.name || modelId
}

function open(index?: number) {
  if (index !== undefined && index >= 0 && index < props.tasks.length) {
    currentIndex.value = index
  }
  activeRefIndex.value = 0
  activeResultIndex.value = 0
  refScale.value = 1
  refTranslate.value = { x: 0, y: 0 }
  resultScale.value = 1
  resultTranslate.value = { x: 0, y: 0 }
  emit('update:modelValue', true)
}

function close() {
  emit('update:modelValue', false)
}

function navigateDetail(direction: 'prev' | 'next') {
  if (props.tasks.length === 0) return
  const step = direction === 'next' ? 1 : -1
  let newIdx = currentIndex.value + step
  if (newIdx < 0) newIdx = props.tasks.length - 1
  if (newIdx >= props.tasks.length) newIdx = 0
  currentIndex.value = newIdx
  activeRefIndex.value = 0
  activeResultIndex.value = 0
  refScale.value = 1
  refTranslate.value = { x: 0, y: 0 }
  resultScale.value = 1
  resultTranslate.value = { x: 0, y: 0 }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    navigateDetail('prev')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    navigateDetail('next')
  }
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    window.addEventListener('keydown', handleKeydown)
    if (props.initialIndex !== undefined) {
      currentIndex.value = props.initialIndex
    }
  } else {
    window.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function selectRefImage(i: number) {
  activeRefIndex.value = i
  refScale.value = 1
  refTranslate.value = { x: 0, y: 0 }
}

function selectResultImage(i: number) {
  activeResultIndex.value = i
  resultScale.value = 1
  resultTranslate.value = { x: 0, y: 0 }
}

function handleWheel(e: WheelEvent, target: 'ref' | 'result') {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  if (target === 'ref') {
    refScale.value = Math.max(0.2, Math.min(10, refScale.value + delta))
  } else {
    resultScale.value = Math.max(0.2, Math.min(10, resultScale.value + delta))
  }
}

function handleMouseDown(e: MouseEvent, target: 'ref' | 'result') {
  isDragging.value = true
  currentZoomTarget.value = target
  const t = target === 'ref' ? refTranslate : resultTranslate
  dragStart.value = { x: e.clientX, y: e.clientY, tx: t.value.x, ty: t.value.y }
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  const t = currentZoomTarget.value === 'ref' ? refTranslate : resultTranslate
  t.value = { x: dragStart.value.tx + dx, y: dragStart.value.ty + dy }
}

function handleMouseUp() {
  isDragging.value = false
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="图片对比"
    width="90%"
    top="3vh"
    :close-on-click-modal="false"
    @update:model-value="close"
    @mouseup="handleMouseUp"
    @mousemove="handleMouseMove"
  >
    <div class="compare-nav-hint">
      <span>按 <kbd>&uarr;</kbd> <kbd>&darr;</kbd> 方向键切换任务</span>
      <span class="compare-nav-pos">{{ currentIndex + 1 }} / {{ tasks.length }}</span>
    </div>
    <template v-if="currentTask">
      <div class="compare-layout">
        <!-- 左：参考图 -->
        <div class="compare-side">
          <h4 class="compare-title">参考图</h4>
          <div
            class="zoom-container"
            v-if="refImages.length > 0"
            @wheel.prevent="(e: WheelEvent) => handleWheel(e, 'ref')"
            @mousedown.prevent="(e: MouseEvent) => handleMouseDown(e, 'ref')"
          >
            <img
              :src="refImages[activeRefIndex]"
              :style="{
                transform: `translate(${refTranslate.x}px,${refTranslate.y}px) scale(${refScale})`,
                cursor: isDragging ? 'grabbing' : 'grab',
              }"
              draggable="false"
            />
            <div class="zoom-info">{{ Math.round(refScale * 100) }}%</div>
            <div v-if="refImages.length > 1" class="strip-overlay">
              <img
                v-for="(url, i) in refImages"
                :key="i"
                :src="url"
                class="thumb-item"
                :class="{ active: activeRefIndex === i }"
                @click.stop="selectRefImage(i)"
              />
            </div>
          </div>
          <div v-else class="no-image">无参考图</div>
        </div>

        <!-- 右：结果图 -->
        <div class="compare-main">
          <h4 class="compare-title">结果图</h4>
          <div
            class="zoom-container"
            v-if="resultImages.length > 0"
            @wheel.prevent="(e: WheelEvent) => handleWheel(e, 'result')"
            @mousedown.prevent="(e: MouseEvent) => handleMouseDown(e, 'result')"
          >
            <img
              :src="resultImages[activeResultIndex]"
              :style="{
                transform: `translate(${resultTranslate.x}px,${resultTranslate.y}px) scale(${resultScale})`,
                cursor: isDragging ? 'grabbing' : 'grab',
              }"
              draggable="false"
            />
            <div class="zoom-info">{{ Math.round(resultScale * 100) }}%</div>
            <div class="strip-overlay detail-info-overlay">
              <span>模型: {{ modelDisplayName(currentTask.model) }}</span>
              <span>参数: {{ currentTask.resolution }} / {{ currentTask.aspectRatio }}</span>
            </div>
            <div v-if="resultImages.length > 1" class="strip-overlay" style="bottom: 32px;">
              <img
                v-for="(url, i) in resultImages"
                :key="i"
                :src="url"
                class="thumb-item"
                :class="{ active: activeResultIndex === i }"
                @click.stop="selectResultImage(i)"
              />
            </div>
          </div>
          <div v-else class="no-image">
            <template v-if="currentTask.status === 'in_progress' || currentTask.status === 'queued' || currentTask.status === 'submitted'">
              生成中...
            </template>
            <template v-else>暂无结果图</template>
          </div>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.compare-nav-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 12px 0;
  font-size: var(--el-font-size-small);
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 12px;
}
.compare-nav-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  font-size: var(--el-font-size-extra-small);
  font-family: inherit;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--momo-radius-sm);
  line-height: 1;
}
.compare-nav-pos {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.compare-layout {
  display: flex;
  gap: 20px;
  height: 70vh;
}
.compare-side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.compare-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.compare-title {
  margin: 0;
  font-size: var(--el-font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* Zoom container */
.zoom-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--el-fill-color);
  border-radius: var(--momo-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}
.zoom-container img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: none;
  user-select: none;
  -webkit-user-drag: none;
}
.zoom-info {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: var(--momo-color-overlay);
  color: var(--momo-color-text-inverse);
  padding: 2px 8px;
  border-radius: var(--momo-radius-sm);
  font-size: var(--momo-font-size-sm);
  pointer-events: none;
  z-index: 2;
}

/* Thumbnail strip */
.strip-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: linear-gradient(transparent, var(--momo-color-overlay));
  pointer-events: auto;
  flex-wrap: wrap;
}
.thumb-item {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--momo-radius-sm);
  border: 2px solid transparent;
  cursor: pointer;
}
.thumb-item.active {
  border-color: var(--el-color-primary);
}

/* Detail info overlay */
.detail-info-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 6px 10px;
  font-size: var(--el-font-size-small);
  color: var(--momo-color-text-inverse);
  background: linear-gradient(transparent, var(--momo-color-overlay));
  pointer-events: none;
}

.no-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
}
</style>
