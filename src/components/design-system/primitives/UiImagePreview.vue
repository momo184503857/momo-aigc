<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog'
import { Button } from './button'
const props = defineProps<{ modelValue: boolean; url: string | string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const images = computed(() => (Array.isArray(props.url) ? props.url : [props.url]).filter(Boolean))
const index = ref(0)
const imageRatio = ref(1)
watch(() => images.value[index.value], () => { imageRatio.value = 1 })
function handleImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalWidth && image.naturalHeight) imageRatio.value = image.naturalWidth / image.naturalHeight
}
watch(() => props.modelValue, () => { index.value = 0 })
function step(delta: number) { if (images.value.length) index.value = (index.value + delta + images.value.length) % images.value.length }
</script>
<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="ds-image-preview-dialog" :style="{ '--ds-preview-ratio': imageRatio }" @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)">
      <header class="ds-stack ds-image-preview-heading">
        <DialogTitle>图片预览</DialogTitle>
        <DialogDescription>{{ images.length ? `${index + 1} / ${images.length}` : '暂无图片' }}</DialogDescription>
      </header>
      <div class="ds-image-preview-stage">
        <img v-if="modelValue && images[index]" :src="images[index]" alt="预览图片" @load="handleImageLoad" />
      </div>
      <div v-if="images.length > 1" class="ds-row">
        <Button variant="outline" @click="step(-1)">上一张</Button>
        <Button variant="outline" @click="step(1)">下一张</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
