<script setup lang="ts">
defineProps<{ src?:string; poster?:string; title:string; captions?:string }>()
defineEmits<{ play:[]; pause:[]; error:[] }>()
</script>
<template><figure class="ds-stack"><video v-if="src" class="ds-image" controls preload="metadata" :src="src" :poster="poster" :aria-label="title" @play="$emit('play')" @pause="$emit('pause')" @error="$emit('error')"><track v-if="captions" kind="captions" :src="captions" srclang="zh" label="中文字幕" default /></video><div v-else class="ds-result"><p>暂无视频资源</p><p class="ds-caption">传入 src 后显示播放器，不自动播放。</p></div><figcaption class="ds-caption">{{ title }}</figcaption></figure></template>
