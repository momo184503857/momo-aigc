<script setup lang="ts">
import { ref, watch } from 'vue'
import { Download, RotateCcw, Info, Image, LoaderCircle } from '@lucide/vue'
import { Button } from '../primitives/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../primitives/dialog'
const props = defineProps<{ src?: string; title: string; loading?: boolean; externalPreview?: boolean; statusLabel?: string; progress?: number }>()
defineEmits<{ download: []; edit: []; detail: []; preview: [] }>()
const open = ref(false)
const unavailable = ref(false)
watch(() => props.src, () => { unavailable.value = false })
</script>
<template>
  <article class="ds-result-tile" :aria-label="title">
    <Button v-if="src && !loading" variant="ghost" class="ds-result-image" :aria-label="`预览${title}`" @click="externalPreview ? $emit('preview') : open = true">
      <img v-if="!unavailable" :src="src" :alt="title" loading="lazy" @error="unavailable = true" />
      <span v-else class="ds-result-placeholder"><Image />图片暂时无法加载</span>
    </Button>
    <div v-else class="ds-result-placeholder" role="status"><LoaderCircle v-if="loading" class="animate-spin" /><Image v-else /><span>{{ statusLabel || (loading ? '图片加载中…' : '暂无图片') }}</span><span v-if="loading && progress">{{ progress }}%</span></div>
    <div class="ds-result-actions" aria-label="图片操作">
      <slot name="actions">
        <Button variant="ghost" size="icon-sm" :disabled="!src || loading || unavailable" aria-label="下载" title="下载" @click="$emit('download')"><Download /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="重新编辑" title="重新编辑" @click="$emit('edit')"><RotateCcw /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="详情" title="详情" @click="$emit('detail')"><Info /></Button>
      </slot>
    </div>
    <Dialog v-model:open="open"><DialogContent><DialogTitle class="sr-only">{{ title }}</DialogTitle><DialogDescription class="sr-only">图片预览</DialogDescription><img :src="src" :alt="title" class="ds-result-preview" /></DialogContent></Dialog>
  </article>
</template>
