<script setup lang="ts">
/**
 * PromptCardUpload - 上传提示词卡片弹窗。
 * 选择模块 + 提示词内容（必填）+ 图片（1~10 张，可置顶一张）+ 备注（可选）。
 * 图片上传走 OSS 直传（ossApi.upload，scope=materials）。
 */
import { ref, computed } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { ossApi } from '@/services/ossApi'
import { promptCardsApi, type PromptModule } from '@/services/promptCardsApi'
import { Picture, UploadFilled, Close, Star, Loading } from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
  modules: PromptModule[]
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
}>()

const { success, warning, error } = useUiFeedback()

const MAX_IMAGES = 10

const moduleId = ref<number | null>(null)
const content = ref('')
const remark = ref('')
const submitting = ref(false)

interface ImgItem { url: string; loading?: boolean }
const images = ref<ImgItem[]>([])
const coverIndex = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const sortedModules = computed(() =>
  [...props.modules].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
)

function reset() {
  moduleId.value = null
  content.value = ''
  remark.value = ''
  images.value = []
  coverIndex.value = 0
}

function closeDialog() {
  visible.value = false
}

// 选择文件 → 循环上传
async function handleFiles(files: FileList | File[]) {
  const arr = Array.from(files)
  if (images.value.length + arr.length > MAX_IMAGES) {
    warning(`最多上传 ${MAX_IMAGES} 张图片`)
  }
  const room = MAX_IMAGES - images.value.length
  const toUpload = arr.slice(0, room)
  if (toUpload.length === 0) return

  for (const file of toUpload) {
    const placeholder: ImgItem = { url: '', loading: true }
    images.value.push(placeholder)
    const idx = images.value.length - 1
    try {
      const res = await ossApi.upload(file, 'materials')
      images.value[idx] = { url: res.publicUrl }
    } catch (e) {
      // 上传失败：移除占位
      images.value.splice(idx, 1)
      if (coverIndex.value >= images.value.length) coverIndex.value = Math.max(0, images.value.length - 1)
      error(e, '图片上传失败')
    }
  }
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) handleFiles(target.files)
  target.value = '' // 允许重复选择同一文件
}

function triggerUpload() {
  fileInputRef.value?.click()
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
}

function removeImage(idx: number) {
  images.value.splice(idx, 1)
  if (images.value.length === 0) {
    coverIndex.value = 0
  } else if (coverIndex.value >= images.value.length) {
    coverIndex.value = images.value.length - 1
  }
}

function setCover(idx: number) {
  coverIndex.value = idx
}

async function handleSubmit() {
  if (!moduleId.value) {
    warning('请选择模块')
    return
  }
  if (!content.value.trim()) {
    warning('请输入提示词内容')
    return
  }
  const urls = images.value.map((i) => i.url)
  if (urls.length < 1) {
    warning('至少上传 1 张图片')
    return
  }
  if (urls.length > MAX_IMAGES) {
    warning(`最多上传 ${MAX_IMAGES} 张图片`)
    return
  }
  if (images.value.some((i) => i.loading)) {
    warning('图片正在上传，请稍候')
    return
  }

  submitting.value = true
  try {
    await promptCardsApi.create({
      module_id: moduleId.value,
      content: content.value.trim(),
      images: urls,
      cover_index: coverIndex.value,
      remark: remark.value.trim(),
    })
    success('提示词已发布')
    reset()
    closeDialog()
    emit('success')
  } catch (e) {
    error(e, '发布失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="上传提示词" width="560px" :close-on-click-modal="false" @closed="reset">
    <el-form label-position="top">
      <el-form-item required label="模块">
        <el-select v-model="moduleId" placeholder="选择这条提示词所属的模块" style="width: 100%">
          <el-option
            v-for="m in sortedModules"
            :key="m.id"
            :label="m.name"
            :value="m.id"
          >
            <span>{{ m.name }}</span>
            <el-tag v-if="m.is_system" size="small" type="info" effect="plain" style="margin-left: 8px">系统</el-tag>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item required label="提示词内容">
        <el-input
          v-model="content"
          type="textarea"
          :rows="4"
          placeholder="填写该模块下的提示词内容，例如「极简杂志风、低饱和」"
          maxlength="1000"
          show-word-limit
          resize="none"
        />
      </el-form-item>

      <el-form-item required label="图片（1~10 张，可选择一张置顶）">
        <div class="upload-area" @drop="onDrop" @dragover.prevent>
          <div class="img-grid">
            <div
              v-for="(img, idx) in images"
              :key="idx"
              class="img-cell"
              :class="{ 'is-cover': idx === coverIndex }"
            >
              <div v-if="img.loading" class="img-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>
              <img v-else :src="img.url" alt="预览图" />
              <div class="img-overlay">
                <el-button
                  text
                  size="small"
                  :icon="Star"
                  :title="idx === coverIndex ? '当前置顶图' : '设为置顶'"
                  :class="{ 'cover-active': idx === coverIndex }"
                  @click.stop="setCover(idx)"
                />
                <el-button text size="small" :icon="Close" title="删除" @click.stop="removeImage(idx)" />
              </div>
              <span v-if="idx === coverIndex" class="cover-badge">置顶</span>
            </div>

            <div
              v-if="images.length < MAX_IMAGES"
              class="upload-trigger"
              @click="triggerUpload"
            >
              <el-icon size="24"><UploadFilled /></el-icon>
              <span>点击或拖拽上传</span>
              <span class="upload-tip">{{ images.length }} / {{ MAX_IMAGES }}</span>
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
      </el-form-item>

      <el-form-item label="备注（可选）">
        <el-input
          v-model="remark"
          type="textarea"
          :rows="2"
          placeholder="补充说明，如使用场景、适用模型等"
          maxlength="500"
          show-word-limit
          resize="none"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">发布</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.upload-area {
  width: 100%;
}
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
  border: 2px solid transparent;
}
.img-cell.is-cover {
  border-color: var(--el-color-primary);
}
.img-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  justify-content: space-between;
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
.cover-active {
  color: var(--el-color-primary) !important;
}
.cover-badge {
  position: absolute;
  left: 2px;
  bottom: 2px;
  font-size: var(--momo-font-size-xs);
  color: #fff;
  background: var(--el-color-primary);
  padding: 1px 6px;
  border-radius: var(--momo-radius-sm);
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
