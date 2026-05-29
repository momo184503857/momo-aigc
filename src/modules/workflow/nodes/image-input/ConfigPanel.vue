<script setup lang="ts">
import { ref } from 'vue'
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
  <div class="config-section">
    <input ref="fileInputRef" type="file" accept="image/*" multiple style="display:none" @change="handleFiles" />
    <el-button type="primary" plain @click="fileInputRef?.click()">添加图片</el-button>
    <div v-if="images().length" class="image-list">
      <div v-for="img in images()" :key="img.id" class="image-item">
        <img :src="img.previewUrl" :alt="img.fileName" />
        <span>{{ img.fileName }}</span>
        <el-button link type="danger" @click="removeImage(img.id)">删除</el-button>
      </div>
    </div>
    <el-empty v-else description="暂无图片" :image-size="80" />
  </div>
</template>

<style scoped>
.config-section { display: flex; flex-direction: column; gap: 12px; }
.image-list { display: flex; flex-direction: column; gap: 8px; }
.image-item { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--el-border-color-lighter); border-radius: var(--momo-radius-sm); }
.image-item img { width: 48px; height: 48px; object-fit: cover; border-radius: var(--momo-radius-sm); }
.image-item span { flex: 1; font-size: var(--el-font-size-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
