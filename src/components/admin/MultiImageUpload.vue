<script setup lang="ts">
/**
 * MultiImageUpload — 通用多图上传（OSS 直传，scope=materials）。
 * v-model 为图片 URL 数组；受 max 上限约束（超出提示并截断）。
 * sortable 开启后图片可拖拽调整顺序；captionPrefix 在每张图下方显示序号说明
 * （如「点位」→ 点位1/点位2…），用于图片顺序与业务点位一一对应的场景。
 */
import { computed, ref } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { ossApi } from '@/services/ossApi'
import { Close, Loading, UploadFilled } from '@element-plus/icons-vue'

defineOptions({ name: 'MultiImageUpload' })

const props = withDefaults(defineProps<{
  modelValue: string[]
  max?: number
  /** 允许拖拽调整图片顺序 */
  sortable?: boolean
  /** 图片下方序号说明前缀（如「点位」→ 点位1/点位2…） */
  captionPrefix?: string
}>(), { max: 5, sortable: false, captionPrefix: '' })

const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void
}>()

const ui = useUiFeedback()
const fileInputRef = ref<HTMLInputElement | null>(null)
/** 并发上传中的占位数（仅展示用） */
const uploadingCount = ref(0)

const images = computed(() => props.modelValue || [])
/** 已有 + 上传中占满后隐藏上传入口 */
const full = computed(() => images.value.length + uploadingCount.value >= props.max)

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFiles(files: FileList | File[]) {
  const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
  if (arr.length === 0) return
  const room = props.max - images.value.length - uploadingCount.value
  if (arr.length > room) ui.warning(`最多上传 ${props.max} 张图片`)
  const toUpload = arr.slice(0, Math.max(0, room))
  for (const file of toUpload) {
    uploadingCount.value++
    try {
      const res = await ossApi.upload(file, 'materials')
      emit('update:modelValue', [...images.value, res.publicUrl])
    } catch (e) {
      ui.error(e, '图片上传失败')
    } finally {
      uploadingCount.value--
    }
  }
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) handleFiles(target.files)
  target.value = '' // 允许重复选择同一文件
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
}

function removeImage(idx: number) {
  const next = [...images.value]
  next.splice(idx, 1)
  emit('update:modelValue', next)
}

// ── 拖拽排序（sortable 时启用；与外层文件拖入上传互不干扰） ──
const dragIdx = ref<number | null>(null)
const overIdx = ref<number | null>(null)

function onCellDragStart(idx: number, e: DragEvent) {
  dragIdx.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 需 setData 才会触发后续 dragover/drop
    e.dataTransfer.setData('text/plain', String(idx))
  }
}

function onCellDragOver(idx: number, e: DragEvent) {
  if (dragIdx.value === null || dragIdx.value === idx) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  overIdx.value = idx
}

function onCellDragLeave(idx: number) {
  if (overIdx.value === idx) overIdx.value = null
}

function onCellDrop(idx: number, e: DragEvent) {
  e.preventDefault()
  e.stopPropagation() // 不冒泡到外层（外层 drop 走文件上传逻辑）
  if (dragIdx.value !== null && dragIdx.value !== idx) {
    const next = [...images.value]
    const [moved] = next.splice(dragIdx.value, 1)
    next.splice(idx, 0, moved)
    emit('update:modelValue', next)
  }
  dragIdx.value = null
  overIdx.value = null
}
</script>

<template>
  <div class="multi-upload" @drop="onDrop" @dragover.prevent>
    <div class="img-grid">
      <div
        v-for="(url, idx) in images"
        :key="url + idx"
        class="img-cell"
        :class="{
          sortable,
          dragging: sortable && dragIdx === idx,
          'drop-target': sortable && overIdx === idx && dragIdx !== idx,
        }"
        :draggable="sortable"
        @dragstart="sortable ? onCellDragStart(idx, $event) : undefined"
        @dragend="dragIdx = null; overIdx = null"
        @dragover="sortable ? onCellDragOver(idx, $event) : undefined"
        @dragleave="onCellDragLeave(idx)"
        @drop="sortable ? onCellDrop(idx, $event) : undefined"
      >
        <div class="img-wrap">
          <el-image :src="url" fit="cover" :preview-src-list="images" :initial-index="idx" preview-teleported />
          <div class="img-overlay">
            <el-button text size="small" :icon="Close" title="删除" @click.stop="removeImage(idx)" />
          </div>
        </div>
        <div v-if="captionPrefix" class="img-caption">{{ captionPrefix }}{{ idx + 1 }}</div>
      </div>

      <div v-for="i in uploadingCount" :key="`loading-${i}`" class="img-cell">
        <div class="img-loading"><el-icon class="is-loading"><Loading /></el-icon></div>
      </div>

      <div v-if="!full" class="upload-trigger" @click="triggerUpload">
        <el-icon size="22"><UploadFilled /></el-icon>
        <span>点击或拖拽上传</span>
        <span class="upload-tip">{{ images.length }} / {{ max }}</span>
      </div>
    </div>
    <div v-if="sortable" class="sort-tip">
      拖拽图片调整顺序{{ captionPrefix ? `，图片顺序即${captionPrefix}顺序` : '' }}
    </div>
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      style="display: none"
      @change="onFileChange"
    />
  </div>
</template>

<style scoped>
.img-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  width: 100%;
}
.img-cell {
  position: relative;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  background: var(--el-fill-color);
  display: flex;
  flex-direction: column;
}
.img-cell.sortable {
  cursor: grab;
}
.img-cell.sortable:active {
  cursor: grabbing;
}
.img-wrap {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
}
.img-cell .el-image {
  width: 100%;
  height: 100%;
  display: block;
}
.img-caption {
  flex: none;
  padding: 3px 0;
  text-align: center;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-secondary);
  background: var(--el-fill-color-light);
  user-select: none;
}
.img-cell.dragging {
  opacity: 0.45;
}
.img-cell.drop-target .img-wrap {
  outline: 2px dashed var(--momo-color-brand);
  outline-offset: -2px;
}
.sort-tip {
  margin-top: var(--momo-space-2);
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
}
.img-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.img-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  background: linear-gradient(to bottom, rgba(0,0,0,0.45), transparent 60%);
  opacity: 0;
  transition: opacity 0.15s;
}
.img-cell:hover .img-overlay {
  opacity: 1;
}
.img-overlay .el-button {
  color: #fff;
  margin: 2px;
  padding: 4px;
}
.upload-trigger {
  aspect-ratio: 1;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--momo-radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--el-text-color-placeholder);
  transition: border-color 0.15s, color 0.15s;
}
.upload-trigger:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.upload-trigger span {
  font-size: var(--momo-font-size-xs);
}
.upload-tip {
  opacity: 0.7;
}
</style>
