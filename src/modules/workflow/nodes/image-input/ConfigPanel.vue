<script setup lang="ts">
import { ref } from 'vue'
import { UiEmptyState } from '@/components/ui'
import { Button } from '@/components/ui/button'
import type { WorkflowNode, LocalImageAsset } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()
const fileInputRef = ref<HTMLInputElement | null>(null)

function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return typeof asset.id === 'string' && typeof asset.fileName === 'string' && typeof asset.localPath === 'string' && typeof asset.previewUrl === 'string'
}

const images = () => {
  const imgs = props.node.config.images
  return Array.isArray(imgs) ? imgs.filter(isLocalImageAsset) : []
}

async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return

  const newImages: LocalImageAsset[] = []
  for (const file of files) {
    const previewUrl = await readFileAsDataUrl(file)
    newImages.push({
      id: crypto.randomUUID(),
      fileName: file.name,
      localPath: previewUrl,
      previewUrl,
    })
  }
  emit('update', { images: [...images(), ...newImages] })
  input.value = ''
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') resolve(reader.result); else reject(new Error('读取失败')) }
    reader.onerror = () => reject(new Error('读取失败'))
    reader.readAsDataURL(file)
  })
}

function removeImage(imageId: string) {
  emit('update', { images: images().filter((img) => img.id !== imageId) })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <input ref="fileInputRef" type="file" accept="image/*" multiple style="display:none" @change="handleFiles" />
    <Button variant="outline" @click="fileInputRef?.click()">添加图片</Button>
    <div v-if="images().length" class="image-list">
      <div v-for="img in images()" :key="img.id" class="image-item">
        <img :src="img.previewUrl" :alt="img.fileName" />
        <span>{{ img.fileName }}</span>
        <Button variant="link" class="text-destructive" @click="removeImage(img.id)">删除</Button>
      </div>
    </div>
    <UiEmptyState v-else title="暂无图片" />
  </div>
</template>

<style scoped>
.image-list { display: flex; flex-direction: column; gap: 8px; }
.image-item { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--momo-color-border-soft); border-radius: var(--momo-radius-sm); }
.image-item img { width: 48px; height: 48px; object-fit: cover; border-radius: var(--momo-radius-sm); }
.image-item span { flex: 1; font-size: var(--momo-font-size-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
