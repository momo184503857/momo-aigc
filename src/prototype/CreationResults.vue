<script setup lang="ts">
import { reactive } from 'vue'
import { ArrowDownToLine, ArrowUpRight, Check, CircleAlert, Expand, Image, LoaderCircle, RotateCcw, SlidersHorizontal } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { modeLabel, type Creation, type ImageTask, type Round } from './model'

defineProps<{ creation: Creation; uploading: boolean }>()
const emit = defineEmits<{ preview: [task: ImageTask]; reference: [task: ImageTask]; download: [task: ImageTask]; reuse: [round: Round]; retry: [round: Round, task: ImageTask]; parameters: [round: Round]; example: [] }>()
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
        <div class="round-heading">
          <div class="round-title"><span class="round-number">{{ String(creation.rounds.length - roundIndex).padStart(2, '0') }}</span><span>{{ modeLabel(round.mode) }}</span><span class="round-time">{{ time(round.createdAt) }}</span></div>
          <div class="round-actions"><Button variant="ghost" size="sm" :aria-label="`查看第 ${creation.rounds.length - roundIndex} 轮参数`" @click="emit('parameters', round)"><SlidersHorizontal :size="14" /><span>参数</span></Button><Button variant="ghost" size="sm" @click="emit('reuse', round)"><RotateCcw :size="14" /><span>复用参数</span></Button></div>
        </div>
        <p class="round-prompt">{{ round.params.prompt || '使用参考图片进行创作' }}</p>
        <div class="image-grid" :class="{ 'single-image': round.tasks.length === 1 }">
          <div v-for="(task, index) in round.tasks" :key="task.id" class="result-card" :data-status="task.status">
            <template v-if="task.status === 'success'">
              <button class="result-image-button" :aria-label="`预览第 ${creation.rounds.length - roundIndex} 轮图片 ${index + 1}`" @click="emit('preview', task)">
                <img v-if="!failedImages.has(task.id)" :src="task.source" :alt="`摄影示例 ${index + 1}，非实际生成图片`" loading="lazy" @error="failedImages.add(task.id)" />
                <span v-else class="image-unavailable"><Image :size="28" />摄影示例暂时无法加载<span>需要连接互联网查看</span></span>
                <span class="sample-label">摄影示例</span><span class="expand-image"><Expand :size="16" /></span>
              </button>
              <div class="image-actions"><button type="button" :aria-label="`下载图片 ${index + 1}`" @click="emit('download', task)"><ArrowDownToLine :size="15" /><span>保存图片</span></button><button type="button" :disabled="uploading" @click="emit('reference', task)">用作参考 <ArrowUpRight :size="13" /></button><button v-if="failedImages.has(task.id)" type="button" @click="failedImages.delete(task.id)">重载图片</button></div>
            </template>
            <div v-else-if="task.status === 'running'" class="task-placeholder running-placeholder" role="status"><div class="render-orbit"><LoaderCircle :size="24" /></div><strong>让灵感慢慢成形</strong><span>正在模拟生成第 {{ index + 1 }} 张图片</span><div class="mock-progress"><i /></div></div>
            <div v-else class="task-placeholder failed-placeholder"><CircleAlert :size="25" /><strong>这一次，差一点</strong><span>{{ task.error }}</span><Button variant="outline" size="sm" @click="emit('retry', round, task)"><RotateCcw :size="13" />重试这张</Button></div>
          </div>
        </div>
        <div class="round-caption"><span v-if="round.tasks.every(t => t.status === 'success')"><Check :size="13" /> {{ round.tasks.length }} 张图片已就绪</span><span v-else-if="round.tasks.some(t => t.status === 'failed')"><CircleAlert :size="13" /> 部分图片未完成</span><span v-else><LoaderCircle :size="13" class="spin" /> 正在模拟生成</span><span>{{ round.params.ratio }} · {{ round.params.resolution }} · {{ round.params.model }}</span></div>
      </article>
      <p class="examples-credit">图片为 Unsplash 摄影示例，仅用于界面体验；与输入内容无生成关系。</p>
    </div>
  </section>
</template>
