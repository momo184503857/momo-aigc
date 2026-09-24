<script setup lang="ts">
/**
 * MaterialUploadDialog — 批量上传素材弹窗。
 * 整批共用一组标签（顶部），每张图一行提示词。
 * 图片浏览器直传 OSS（ossApi.upload），DB 批量写入走单事务。
 */
import { ref, onUnmounted } from 'vue'
import { Plus, Trash2, Upload, LoaderCircle } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/design-system/primitives/dialog'
import { Button } from '@/components/design-system/primitives/button'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { Label } from '@/components/design-system/primitives/label'
import { Progress } from '@/components/design-system/primitives/progress'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error } = useUiFeedback()
import { ossApi } from '@/services/ossApi'
import { adminBuyerShowApi, type BatchCreateItem } from '@/services/buyerShowApi'
import MaterialTagInput from './MaterialTagInput.vue'

const visible = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [] }>()

interface UploadRow {
  id: string
  file: File
  previewUrl: string
  prompt: string
  status: 'pending' | 'uploading' | 'done' | 'error'
}

const rows = ref<UploadRow[]>([])
const sharedTagIds = ref<number[]>([])
const submitting = ref(false)
const progress = ref({ done: 0, total: 0, failed: [] as string[] })

let seq = 0
function nextId(): string {
  seq += 1
  return `row-${seq}-${Date.now()}`
}

function revokeAll() {
  for (const row of rows.value) URL.revokeObjectURL(row.previewUrl)
}

function pickFiles() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp'
  input.multiple = true
  input.onchange = () => {
    const files = Array.from(input.files || [])
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        warning(`${file.name} 超过 10MB，已跳过`)
        continue
      }
      rows.value.push({
        id: nextId(),
        file,
        previewUrl: URL.createObjectURL(file),
        prompt: '',
        status: 'pending',
      })
    }
  }
  input.click()
}

function removeRow(id: string) {
  const idx = rows.value.findIndex(r => r.id === id)
  if (idx >= 0) {
    URL.revokeObjectURL(rows.value[idx].previewUrl)
    rows.value.splice(idx, 1)
  }
}

function clearRows() {
  revokeAll()
  rows.value = []
}

async function submit() {
  if (rows.value.length === 0) {
    warning('请先选择图片')
    return
  }
  for (let i = 0; i < rows.value.length; i++) {
    if (!rows.value[i].prompt.trim()) {
      warning(`第 ${i + 1} 行提示词不能为空`)
      return
    }
  }

  submitting.value = true
  progress.value = { done: 0, total: rows.value.length, failed: [] }

  const items: BatchCreateItem[] = []
  for (const row of rows.value) {
    row.status = 'uploading'
    try {
      const { objectKey, publicUrl, ossBucket } = await ossApi.upload(row.file, 'materials')
      // 读宽高（失败不影响上传）
      let width: number | undefined
      let height: number | undefined
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('load'))
          img.src = row.previewUrl
        })
        width = img.naturalWidth
        height = img.naturalHeight
      } catch { /* ignore */ }

      items.push({
        oss_bucket: ossBucket,
        oss_object_key: objectKey,
        public_url: publicUrl,
        prompt: row.prompt.trim(),
        original_filename: row.file.name,
        mime_type: row.file.type,
        size_bytes: row.file.size,
        width,
        height,
        tagIds: sharedTagIds.value.length ? [...sharedTagIds.value] : undefined,
      })
      row.status = 'done'
    } catch (e: any) {
      row.status = 'error'
      progress.value.failed.push(row.file.name)
    }
    progress.value.done++
  }

  if (items.length > 0) {
    try {
      await adminBuyerShowApi.batchCreate(items)
    } catch (e: any) {
      submitting.value = false
      error(e, '保存失败')
      return
    }
    success(`已上传 ${items.length} 条素材`)
  }

  submitting.value = false
  if (progress.value.failed.length > 0) {
    warning(`${progress.value.failed.length} 条失败：${progress.value.failed.join('、')}`)
  }

  if (items.length > 0) {
    emit('done')
    reset()
    visible.value = false
  }
}

function reset() {
  revokeAll()
  rows.value = []
  sharedTagIds.value = []
  progress.value = { done: 0, total: 0, failed: [] }
}

onUnmounted(() => {
  revokeAll()
})
</script>

<template>
  <Dialog :open="visible" @update:open="(v) => (visible = v)">
    <DialogContent class="sm:max-w-3xl" @pointer-down-outside.prevent>
      <DialogHeader>
        <DialogTitle>批量上传素材</DialogTitle>
      </DialogHeader>

      <div v-if="visible">
        <!-- 整批标签 -->
        <div class="grid gap-1.5">
          <Label>标签（整批共用，可选）</Label>
          <MaterialTagInput v-model="sharedTagIds" />
        </div>

        <!-- 操作条 -->
        <div class="upload-toolbar">
          <Button :disabled="submitting" @click="pickFiles"><Plus />选择图片</Button>
          <Button v-if="rows.length > 0" variant="outline" :disabled="submitting" @click="clearRows"><Trash2 />清空</Button>
          <span class="upload-count" v-if="rows.length > 0">共 {{ rows.length }} 张</span>
        </div>

        <!-- 进度 -->
        <Progress
          v-if="submitting"
          :model-value="progress.total ? Math.round((progress.done / progress.total) * 100) : 0"
          style="margin-bottom: 12px"
          :class="progress.failed.length > 0 ? '' : ''"
        />

        <!-- 行列表 -->
        <div v-if="rows.length === 0" class="upload-empty">
          <Upload class="size-10" />
          <p>点击「选择图片」添加素材，可多选</p>
        </div>

        <div v-else class="upload-rows">
          <div
            v-for="(row, idx) in rows"
            :key="row.id"
            class="upload-row"
            :class="{ 'is-error': row.status === 'error', 'is-done': row.status === 'done' }"
          >
            <img class="upload-row-thumb" :src="row.previewUrl" :alt="row.file.name" />
            <div class="upload-row-main">
              <div class="upload-row-name">{{ row.file.name }}</div>
              <Textarea
                v-model="row.prompt"
                :rows="2"
                :disabled="submitting"
                :placeholder="`第 ${idx + 1} 张的提示词`"
                class="resize-none"
              />
            </div>
            <Button
              v-if="!submitting"
              variant="destructive"
              size="icon-sm"
              class="upload-row-remove"
              @click="removeRow(row.id)"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="submitting" @click="visible = false">取消</Button>
        <Button :disabled="submitting || rows.length === 0" @click="submit">
          <LoaderCircle v-if="submitting" class="animate-spin" />上传 {{ rows.length > 0 ? `(${rows.length})` : '' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.upload-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  margin-bottom: 12px;
}
.upload-count {
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
}

.upload-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: var(--muted-foreground);
}
.upload-empty p {
  margin-top: 12px;
  font-size: var(--ds-font-small);
}

.upload-rows {
  max-height: 46vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.upload-row {
  display: flex;
  gap: 12px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--ds-radius);
  background: var(--card);
  transition: border-color 0.2s, background 0.2s;
}
.upload-row.is-error {
  border-color: var(--destructive);
  background: var(--ds-danger-surface);
}
.upload-row.is-done {
  opacity: 0.6;
}
.upload-row-thumb {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--ds-radius);
  background: var(--muted);
}
.upload-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.upload-row-name {
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.upload-row-remove {
  flex-shrink: 0;
  align-self: flex-start;
}
</style>
