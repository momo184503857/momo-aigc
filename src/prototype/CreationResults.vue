<script setup lang="ts">
import { reactive } from 'vue'
import { ArrowDownToLine, ArrowUpRight, CircleAlert, Image, LoaderCircle, RotateCcw, Info } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { type Creation, type ImageTask, type Round } from './model'

defineProps<{ creation: Creation; uploading: boolean }>()
const emit = defineEmits<{ preview: [task: ImageTask]; reference: [task: ImageTask]; download: [task: ImageTask]; reuse: [round: Round]; retry: [round: Round, task: ImageTask]; parameters: [round: Round, task: ImageTask]; example: [] }>()
const failedImages = reactive(new Set<string>())
const time = (value: number) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <section class="studio-results" aria-label="创作结果">
    <div v-if="!creation.rounds.length" class="studio-empty">
      <div class="empty-art" aria-hidden="true"><div class="empty-paper paper-back" /><div class="empty-paper paper-front"><span class="paper-sun" /><span class="paper-hill" /><span class="paper-hill small" /></div><span class="empty-spark">✳</span></div>
      <span class="eyebrow">留一点空间，给想象</span>
      <h2>下一张好图，<br />从你的想法开始。</h2>
      <p>在左侧添加参考图，或写下画面描述。<br />每一次尝试，都会留在这次创作里。</p>
      <Button variant="ghost" class="empty-example" @click="emit('example')">先看一组示例 <ArrowUpRight :size="15" /></Button>
    </div>
    <div v-else class="round-list">
      <article v-for="(round, roundIndex) in creation.rounds" :key="round.id" class="creation-round">
        <div class="round-heading"><time class="round-time" :datetime="new Date(round.createdAt).toISOString()">{{ time(round.createdAt) }}</time></div>
        <div class="image-grid" :class="{ 'single-image': round.tasks.length === 1 }">
          <div v-for="(task, index) in round.tasks" :key="task.id" class="result-card" :data-status="task.status">
            <template v-if="task.status === 'success'">
              <button class="result-image-button" :aria-label="`预览第 ${creation.rounds.length - roundIndex} 轮图片 ${index + 1}`" @click="emit('preview', task)">
                <img v-if="!failedImages.has(task.id)" :src="task.source" :alt="`摄影示例 ${index + 1}，非实际生成图片`" loading="lazy" @error="failedImages.add(task.id)" />
                <span v-else class="image-unavailable"><Image :size="28" />摄影示例暂时无法加载<span>需要连接互联网查看</span></span>
              </button>

            </template>
            <div v-else-if="task.status === 'running'" class="task-placeholder running-placeholder" role="status"><div class="render-orbit"><LoaderCircle :size="24" /></div><strong>让灵感慢慢成形</strong><span>正在模拟生成第 {{ index + 1 }} 张图片</span><div class="mock-progress"><i /></div></div>
            <div v-else class="task-placeholder failed-placeholder"><CircleAlert :size="25" /><strong>生成失败</strong></div>
            <div class="result-hover-actions" aria-label="图片操作">
              <button type="button" :disabled="task.status !== 'success'" @click="emit('download', task)"><ArrowDownToLine :size="14" /><span>下载</span></button>
              <button type="button" @click="emit('reuse', round)"><RotateCcw :size="14" /><span>重新编辑</span></button>
              <button type="button" @click="emit('parameters', round, task)"><Info :size="14" /><span>详情</span></button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
