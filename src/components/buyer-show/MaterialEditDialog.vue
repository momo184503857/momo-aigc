<script setup lang="ts">
/**
 * MaterialEditDialog — 编辑单条素材：提示词 + 标签 + 替换图片。
 * 替换的图片在「保存」时才上传 OSS，取消不会产生孤儿对象。
 */
import { ref, watch, onUnmounted } from 'vue'
import { RefreshCw, LoaderCircle } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error } = useUiFeedback()
import { ossApi } from '@/services/ossApi'
import { adminBuyerShowApi, type BuyerShowMaterial } from '@/services/buyerShowApi'
import MaterialTagInput from './MaterialTagInput.vue'

const props = defineProps<{ material: BuyerShowMaterial | null }>()
const visible = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [] }>()

const prompt = ref('')
const tagIds = ref<number[]>([])
const saving = ref(false)

// 待替换的图片（保存时才上传）
const pendingFile = ref<File | null>(null)
const pendingPreview = ref<string>('')

const previewUrl = () => pendingPreview.value || props.material?.public_url || ''

function init() {
  const m = props.material
  if (!m) return
  prompt.value = m.prompt || ''
  tagIds.value = (m.tags || []).map(t => t.id)
  clearPending()
}

function clearPending() {
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingFile.value = null
  pendingPreview.value = ''
}

function pickReplace() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      warning(`${file.name} 超过 10MB`)
      return
    }
    if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
    pendingFile.value = file
    pendingPreview.value = URL.createObjectURL(file)
  }
  input.click()
}

async function save() {
  if (!props.material) return
  if (!prompt.value.trim()) {
    warning('提示词不能为空')
    return
  }
  saving.value = true
  try {
    const data: Parameters<typeof adminBuyerShowApi.update>[1] = {
      prompt: prompt.value.trim(),
      tagIds: tagIds.value,
    }
    if (pendingFile.value) {
      const { objectKey, publicUrl, ossBucket } = await ossApi.upload(pendingFile.value, 'materials')
      let width: number | undefined
      let height: number | undefined
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('load'))
          img.src = pendingPreview.value
        })
        width = img.naturalWidth
        height = img.naturalHeight
      } catch { /* ignore */ }
      data.image = {
        oss_bucket: ossBucket,
        oss_object_key: objectKey,
        public_url: publicUrl,
        original_filename: pendingFile.value.name,
        mime_type: pendingFile.value.type,
        size_bytes: pendingFile.value.size,
        width,
        height,
      }
    }
    await adminBuyerShowApi.update(props.material.id, data)
    success('保存成功')
    emit('done')
    visible.value = false
  } catch (e: any) {
    error(e, '保存失败')
  } finally {
    saving.value = false
  }
}

watch(() => props.material, () => init())
watch(visible, (v) => { if (v) init() })

onUnmounted(() => {
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
})
</script>

<template>
  <Dialog :open="visible" @update:open="(v) => (visible = v)">
    <DialogContent class="sm:max-w-2xl" @pointer-down-outside.prevent>
      <DialogHeader>
        <DialogTitle>编辑素材</DialogTitle>
      </DialogHeader>

      <div v-if="visible && material" class="flex flex-col gap-4">
        <div class="grid gap-1.5">
          <Label>图片</Label>
          <div class="edit-image">
            <img class="edit-image-preview" :src="previewUrl()" :alt="material.prompt" />
            <div class="edit-image-actions">
              <Button variant="outline" size="sm" @click="pickReplace"><RefreshCw />替换图片</Button>
              <Button
                v-if="pendingFile"
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="clearPending"
              >恢复原图</Button>
              <span v-if="pendingFile" class="edit-image-hint">已选择新图，保存后生效</span>
            </div>
          </div>
        </div>
        <div class="grid gap-1.5">
          <Label for="material-prompt">提示词</Label>
          <Textarea id="material-prompt" v-model="prompt" :rows="4" placeholder="输入提示词" />
        </div>
        <div class="grid gap-1.5">
          <Label>标签</Label>
          <MaterialTagInput v-model="tagIds" />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="saving" @click="visible = false">取消</Button>
        <Button :disabled="saving" @click="save">
          <LoaderCircle v-if="saving" class="animate-spin" />保存
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.edit-image {
  display: flex;
  align-items: center;
  gap: 16px;
}
.edit-image-preview {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: var(--momo-radius-md);
  border: 1px solid var(--momo-color-border-soft);
  background: var(--momo-color-bg-muted);
  flex-shrink: 0;
}
.edit-image-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.edit-image-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-warning);
}
</style>
