<script setup lang="ts">
/**
 * MultiImageUpload — 通用多图上传（OSS 直传，scope=materials）。
 * v-model 为图片 URL 数组；受 max 上限约束（超出提示并截断）。
 */
import { computed, ref } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { ossApi } from '@/services/ossApi'
import { Close, Loading, UploadFilled } from '@element-plus/icons-vue'

defineOptions({ name: 'MultiImageUpload' })

const props = withDefaults(defineProps<{
  modelValue: string[]
  max?: number
}>(), { max: 5 })

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
</script>

<template>
  <div class="multi-upload" @drop="onDrop" @dragover.prevent>
    <div class="img-grid">
      <div v-for="(url, idx) in images" :key="url + idx" class="img-cell">
        <el-image :src="url" fit="cover" :preview-src-list="images" :initial-index="idx" preview-teleported />
        <div class="img-overlay">
          <el-button text size="small" :icon="Close" title="删除" @click.stop="removeImage(idx)" />
        </div>
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
  aspect-ratio: 1;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  background: var(--el-fill-color);
}
.img-cell .el-image {
  width: 100%;
  height: 100%;
  display: block;
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
