<script setup lang="ts">
import { DsFileInput, DsUpload } from '@/components/design-system'
import { ref } from 'vue'
import { Plus, RefreshCw, X } from '@lucide/vue'
import { Button } from '@/components/design-system/primitives/button'
import { UiImagePreview } from '@/components/design-system'
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

const replaceInputRef = ref<InstanceType<typeof DsFileInput> | null>(null)
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
        <Button variant="secondary" size="icon-sm"
          type="button"
          class="absolute top-1.5 right-1.5 z-2 flex cursor-pointer items-center justify-center"
          :aria-label="`删除图片${i + 1}`"
          @click.stop="handleRemove(i)"
        >
          <X class="size-3.5" />
        </Button>
        <!-- Replace button overlay on bottom-right of image -->
        <Button variant="secondary" size="icon-sm"
          type="button"
          class="absolute right-1.5 bottom-1.5 z-2 flex cursor-pointer items-center justify-center transition-transform hover:scale-110"
          :aria-label="`替换图片${i + 1}`"
          @click="handleReplaceClick(i)"
        >
          <RefreshCw class="size-3.5" />
        </Button>
      </div>
      <!-- Hidden file input for replace -->
      <DsFileInput ref="replaceInputRef" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
        @change="handleFileReplace" />
      <!-- Add button: visible when slot is not yet filled -->
      <DsUpload v-if="modelValue.length < maxCount" variant="tile" label="点击上传" accept="image/png,image/jpeg,image/webp,image/gif" :style="{ width: size + 'px', height: size + 'px' }" @select="addFromFiles" />
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
        class="border-border hover:border-primary size-24 shrink-0 cursor-pointer overflow-hidden rounded-sm border-2 transition-all hover:scale-108"
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
