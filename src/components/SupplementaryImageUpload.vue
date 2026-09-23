<script setup lang="ts">
/**
 * SupplementaryImageUpload - 补充图片上传组件
 * 支持最多5张补充图，每张可自定义命名（限制10个字）
 */
import { ref, computed } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

defineOptions({ name: 'SupplementaryImageUpload' })

export interface SupplementaryImage {
  id: string
  dataUrl: string
  name: string
  sourceUrl?: string
  file?: File
}

const props = withDefaults(defineProps<{
  modelValue: SupplementaryImage[]
  maxCount?: number
}>(), {
  maxCount: 5,
})

const emit = defineEmits<{
  'update:modelValue': [images: SupplementaryImage[]]
}>()

const draggedIndex = ref<number | null>(null)
const isDragOver = ref(false)

const canAdd = computed(() => props.modelValue.length < props.maxCount)

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 限制命名长度为10个字
function handleNameChange(index: number, newName: string | number) {
  const updated = [...props.modelValue]
  updated[index] = { ...updated[index], name: String(newName).slice(0, 10) }
  emit('update:modelValue', updated)
}

// 添加图片
function handleAddImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/gif'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    let current = [...props.modelValue]
    for (const file of Array.from(input.files)) {
      if (current.length >= props.maxCount) break
      if (!file.type.startsWith('image/')) continue
      const dataUrl = await fileToDataUrl(file)
      current = [...current, {
        id: generateId(),
        dataUrl,
        name: '', // 不默认命名，让用户自己填写
        file,
      }]
    }
    emit('update:modelValue', current)
  }
  input.click()
}

// 删除图片
function handleRemove(index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
}

// 拖拽排序
function handleDragStart(index: number) {
  draggedIndex.value = index
}

function handleDragOverItem(index: number) {
  if (draggedIndex.value === null || draggedIndex.value === index) return
  const items = [...props.modelValue]
  const [moved] = items.splice(draggedIndex.value, 1)
  items.splice(index, 0, moved)
  emit('update:modelValue', items)
  draggedIndex.value = index
}

function handleDragEnd() {
  draggedIndex.value = null
}

// 拖拽文件添加
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function handleDragEnter() {
  isDragOver.value = true
}

function handleDragLeave(e: DragEvent) {
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as HTMLElement | null
  if (!related || !target.contains(related)) isDragOver.value = false
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    let current = [...props.modelValue]
    for (const file of Array.from(e.dataTransfer.files)) {
      if (current.length >= props.maxCount) break
      if (file.type.startsWith('image/')) {
        const dataUrl = await fileToDataUrl(file)
        current = [...current, { id: generateId(), dataUrl, name: '', file }] // 不默认命名
      }
    }
    emit('update:modelValue', current)
  }
}

// 预览
function showPreview(dataUrl: string) {
  window.open(dataUrl, '_blank')
}
</script>

<template>
  <div class="mb-3.5">
    <div
      class="flex min-h-30 flex-wrap gap-3 rounded-md border-2 border-dashed border-transparent p-2 transition-colors"
      :class="{ 'bg-accent border-primary ring-primary/35 ring-4': isDragOver }"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div
        v-for="(img, index) in modelValue"
        :key="img.id"
        class="flex w-30 flex-col gap-1.5 transition-opacity"
        :class="{ 'opacity-50': draggedIndex === index }"
      >
        <div
          class="group border-border hover:border-primary relative size-30 cursor-grab overflow-hidden rounded-md border-2 transition-colors"
          draggable="true"
          @dragstart="handleDragStart(index)"
          @dragover.prevent="handleDragOverItem(index)"
          @dragend="handleDragEnd"
          @click="showPreview(img.dataUrl)"
        >
          <img :src="img.dataUrl" :alt="img.name" draggable="false" class="size-full cursor-pointer object-cover" />
          <Button
            variant="destructive"
            size="icon-xs"
            class="absolute top-1 right-1 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
            @click.stop="handleRemove(index)"
          >
            <Trash2 />
          </Button>
        </div>
        <Input
          :model-value="img.name"
          placeholder="图片命名"
          :maxlength="10"
          class="h-7 text-[0.8rem]"
          @update:model-value="handleNameChange(index, $event)"
        />
      </div>
      <div
        v-if="canAdd"
        class="border-border text-muted-foreground hover:border-primary hover:text-primary flex size-30 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors"
        @click="handleAddImage"
      >
        <Plus class="size-7" :stroke-width="1.5" />
        <span class="mt-1 text-xs">添加图片</span>
      </div>
    </div>
    <p v-if="modelValue.length > 0" class="text-muted-foreground/70 mt-1.5 text-xs">可拖拽图片排序，命名限制10个字</p>
  </div>
</template>
