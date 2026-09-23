<script setup lang="ts">
/**
 * PromptCardUpload - 上传提示词卡片弹窗。
 * 选择模块 + 提示词内容（必填）+ 图片（1~10 张，可置顶一张）+ 备注（可选）。
 * 图片上传走 OSS 直传（ossApi.upload，scope=materials）。
 */
import { ref, computed } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ossApi } from '@/services/ossApi'
import { promptCardsApi, type PromptModule } from '@/services/promptCardsApi'
import { Upload, X, Star, LoaderCircle } from '@lucide/vue'

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

/** 触发器显示的选中模块名（Select 值为字符串化 id，在边界处转换） */
const selectedModuleName = computed(() =>
  sortedModules.value.find((m) => m.id === moduleId.value)?.name ?? '',
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
  <Dialog :open="visible" @update:open="(v: boolean) => { visible = v; if (!v) reset() }">
    <DialogContent class="sm:max-w-xl" @pointer-down-outside.prevent>
      <DialogHeader>
        <DialogTitle>上传提示词</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <div class="grid gap-1.5">
          <Label><span class="text-destructive">*</span> 模块</Label>
          <Select
            :model-value="moduleId ? String(moduleId) : ''"
            @update:model-value="(v) => (moduleId = v ? Number(v) : null)"
          >
            <SelectTrigger class="w-full">
              <span class="flex-1 truncate text-left" :class="selectedModuleName ? '' : 'text-muted-foreground'">
                {{ selectedModuleName || '选择这条提示词所属的模块' }}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="m in sortedModules" :key="m.id" :value="String(m.id)">
                <span class="flex items-center gap-2">
                  <span>{{ m.name }}</span>
                  <Badge v-if="m.is_system" variant="secondary">系统</Badge>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid gap-1.5">
          <Label><span class="text-destructive">*</span> 提示词内容</Label>
          <div class="relative">
            <Textarea
              v-model="content"
              :rows="4"
              placeholder="填写该模块下的提示词内容，例如「极简杂志风、低饱和」"
              maxlength="1000"
              class="resize-none"
            />
            <span class="text-muted-foreground absolute right-2 bottom-1.5 text-xs">{{ content.length }}/1000</span>
          </div>
        </div>

        <div class="grid gap-1.5">
          <Label><span class="text-destructive">*</span> 图片（1~10 张，可选择一张置顶）</Label>
          <div class="w-full" @drop="onDrop" @dragover.prevent>
            <div class="grid w-full grid-cols-5 gap-2">
              <div
                v-for="(img, idx) in images"
                :key="idx"
                class="group relative aspect-square overflow-hidden rounded-sm bg-muted border-2"
                :class="idx === coverIndex ? 'border-primary' : 'border-transparent'"
              >
                <div v-if="img.loading" class="flex size-full items-center justify-center text-(--momo-color-text-placeholder)">
                  <LoaderCircle class="size-4 animate-spin" />
                </div>
                <img v-else :src="img.url" alt="预览图" class="block size-full object-cover" />
                <div class="absolute inset-0 flex items-start justify-between bg-gradient-to-b from-black/45 to-transparent to-60% opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    class="m-0.5 cursor-pointer rounded-sm p-1"
                    :class="idx === coverIndex ? 'text-primary' : 'text-white'"
                    :title="idx === coverIndex ? '当前置顶图' : '设为置顶'"
                    @click.stop="setCover(idx)"
                  >
                    <Star class="size-4" />
                  </button>
                  <button
                    type="button"
                    class="m-0.5 cursor-pointer rounded-sm p-1 text-white"
                    title="删除"
                    @click.stop="removeImage(idx)"
                  >
                    <X class="size-4" />
                  </button>
                </div>
                <span v-if="idx === coverIndex" class="bg-primary absolute bottom-0.5 left-0.5 rounded-sm px-1.5 py-px text-xs text-white">置顶</span>
              </div>

              <div
                v-if="images.length < MAX_IMAGES"
                class="border-input flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-(--momo-color-text-placeholder) transition-colors hover:border-primary hover:text-primary"
                @click="triggerUpload"
              >
                <Upload class="size-6" />
                <span class="text-xs">点击或拖拽上传</span>
                <span class="text-xs opacity-70">{{ images.length }} / {{ MAX_IMAGES }}</span>
              </div>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="onFileChange"
            />
          </div>
        </div>

        <div class="grid gap-1.5">
          <Label>备注（可选）</Label>
          <div class="relative">
            <Textarea
              v-model="remark"
              :rows="2"
              placeholder="补充说明，如使用场景、适用模型等"
              maxlength="500"
              class="resize-none"
            />
            <span class="text-muted-foreground absolute right-2 bottom-1.5 text-xs">{{ remark.length }}/500</span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="closeDialog">取消</Button>
        <Button :disabled="submitting" @click="handleSubmit">
          <LoaderCircle v-if="submitting" class="animate-spin" />发布
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
