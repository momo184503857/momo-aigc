<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog'
import { Button } from './button'
const props = defineProps<{ modelValue: boolean; url: string | string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const images = computed(() => (Array.isArray(props.url) ? props.url : [props.url]).filter(Boolean))
const index = ref(0)
watch(() => props.modelValue, () => { index.value = 0 })
function step(delta: number) { if (images.value.length) index.value = (index.value + delta + images.value.length) % images.value.length }
</script>
<template><Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)"><DialogContent @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)"><DialogTitle>图片预览</DialogTitle><DialogDescription>{{ images.length ? `${index + 1} / ${images.length}` : '暂无图片' }}</DialogDescription><img v-if="images[index]" :src="images[index]" alt="预览图片" class="ds-image" /><div v-if="images.length > 1" class="ds-row"><Button variant="outline" @click="step(-1)">上一张</Button><Button variant="outline" @click="step(1)">下一张</Button></div></DialogContent></Dialog></template>
