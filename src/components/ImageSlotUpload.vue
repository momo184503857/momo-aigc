<script setup lang="ts">
import { ref } from 'vue'
import { Plus, RefreshCw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { UiImagePreview } from '@/components/ui'
defineOptions({ name: 'ImageSlotUpload' })

export interface SlotImage {
  id: string
  dataUrl: string
  sourceUrl?: string
  file?: File
}

export interface StarredTemplate {
  id: number
  name: string
  public_url: string
}

const props = withDefaults(defineProps<{
  label: string
  maxCount: number
  required: boolean
  modelValue: SlotImage[]
  showTemplateBtn?: boolean
  size?: number
  alignLeft?: boolean
  starredTemplates?: StarredTemplate[]
}>(), { size: 200, starredTemplates: () => [] })

const emit = defineEmits<{
  'update:modelValue': [images: SlotImage[]]
  'template-select': []
  'starred-select': [template: StarredTemplate]
}>()

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function addFromFiles(fileList: FileList | File[]) {
  const files = Array.from(fileList)
  let current = [...props.modelValue]
  for (const file of files) {
    if (current.length >= props.maxCount) break
    if (!file.type.startsWith('image/')) continue
    const dataUrl = await readFileAsDataUrl(file)
    const img: SlotImage = {
      id: generateId(),
      dataUrl,
      file,
    }
    current = [...current, img]
    emit('update:modelValue', current)
  }
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFromFiles(input.files)
  input.value = ''
}

const replaceInputRef = ref<HTMLInputElement | null>(null)
const replacingIndex = ref<number | null>(null)

function handleReplaceClick(index: number) {
  replacingIndex.value = index
  replaceInputRef.value?.click()
}

function handleFileReplace(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || replacingIndex.value === null) return
  const file = input.files[0]
  if (!file.type.startsWith('image/')) return
  const idx = replacingIndex.value
  readFileAsDataUrl(file).then(dataUrl => {
    const newImages = props.modelValue.map((img, i) =>
      i === idx ? { id: img.id, dataUrl, file } : img
    )
    emit('update:modelValue', newImages)
  })
  input.value = ''
  replacingIndex.value = null
}

function handleDrop(e: DragEvent) {
  // Files from OS
  if (e.dataTransfer?.files.length) {
    addFromFiles(e.dataTransfer.files)
    return
  }
  // URL or data URL dragged from task list / browser
  const text = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('text/uri-list')
  if (!text) return
  const url = text.trim()
  // /api/files/ 前缀 = direct 存储模式的任务结果站内地址，提交链路按 sourceUrl 透传后端
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/') && !url.startsWith('/api/files/')) return
  const remaining = props.maxCount - props.modelValue.length
  if (remaining <= 0) return
  const img: SlotImage = {
    id: generateId(),
    dataUrl: url,
    sourceUrl: url.startsWith('http') || url.startsWith('/api/files/') ? url : undefined,
  }
  emit('update:modelValue', [...props.modelValue, img])
}

function handleRemove(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
}

const previewUrl = ref<string>('')
const showPreviewDialog = ref(false)

function showPreview(dataUrl: string) {
  previewUrl.value = dataUrl
  showPreviewDialog.value = true
}
</script>

<template>
  <div class="image-slot-upload mb-3.5 flex flex-col" :class="alignLeft ? 'items-start' : 'items-center'">
    <div
      class="flex flex-wrap items-start gap-2.5"
      :class="alignLeft ? 'justify-start' : 'justify-center'"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <div
        v-for="(img, i) in modelValue"
        :key="img.id"
        class="border-border relative shrink-0 overflow-hidden rounded-md border"
        :style="{ width: size + 'px', height: size + 'px' }"
      >
        <img :src="img.dataUrl" class="size-full cursor-zoom-in object-cover" @click="showPreview(img.dataUrl)" />
        <button
          type="button"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90 absolute top-1.5 right-1.5 z-2 flex size-5.5 cursor-pointer items-center justify-center rounded-full"
          @click.stop="handleRemove(i)"
        >
          <X class="size-3.5" />
        </button>
        <!-- Replace button overlay on bottom-right of image -->
        <button
          type="button"
          class="bg-primary text-primary-foreground hover:bg-primary/90 absolute right-1.5 bottom-1.5 z-2 flex size-5.5 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
          @click="handleReplaceClick(i)"
        >
          <RefreshCw class="size-3.5" />
        </button>
      </div>
      <!-- Hidden file input for replace -->
      <input ref="replaceInputRef" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
        @change="handleFileReplace" />
      <!-- Add button: visible when slot is not yet filled -->
      <label
        v-if="modelValue.length < maxCount"
        class="border-border-strong hover:border-primary text-muted-foreground hover:text-primary flex shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed transition-colors"
        :style="{ width: size + 'px', height: size + 'px' }"
      >
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
          @change="handleFileInput" />
        <Plus class="size-8" :stroke-width="1.5" />
        <span class="text-muted-foreground text-xs">点击上传</span>
      </label>
    </div>
    <div v-if="label" class="text-muted-foreground mt-2 text-sm" :class="alignLeft ? 'text-left' : 'text-center'">
      <span v-if="required" class="text-destructive">*</span>
      {{ label }}
    </div>
    <Button
      v-if="showTemplateBtn"
      size="sm"
      variant="outline"
      class="mt-1"
      @click="emit('template-select')"
    >
      从模板库选择
    </Button>
    <div
      v-if="showTemplateBtn && starredTemplates.length > 0"
      class="mt-2 flex max-w-full gap-2 overflow-x-auto py-1"
    >
      <div
        v-for="t in starredTemplates"
        :key="t.id"
        class="border-border-light hover:border-primary size-24 shrink-0 cursor-pointer overflow-hidden rounded-sm border-2 transition-all hover:scale-108"
        :title="t.name"
        @click="emit('starred-select', t)"
      >
        <img :src="t.public_url" :alt="t.name" class="size-full object-cover" />
      </div>
    </div>
  </div>

  <!-- Preview overlay -->
  <UiImagePreview v-model="showPreviewDialog" :url="previewUrl" />
</template>
