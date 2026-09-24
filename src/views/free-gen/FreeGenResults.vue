<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, nextTick } from 'vue'
import { Download, RotateCcw, Info, Image, LoaderCircle, CircleAlert } from '@lucide/vue'
import { generationApi } from '@/services/generationApi'
import { useTaskManager } from '@/composables/useTaskManager'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { downloadUrl } from '@/utils/download'
import { toBJMinute, parseUTC } from '@/utils/datetime'
import type { TaskItem } from '@/components/TaskList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import PublishWorkDialog from '@/components/works/PublishWorkDialog.vue'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import { Button } from '@/components/ui/button'

const emit = defineEmits<{ reuse: [task: TaskItem] }>()
const tm = useTaskManager()
const feedback = useUiFeedback()
const history = ref<TaskItem[]>([])
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const loadError = ref(false)
const previewTaskId = ref(0)
const previewIndex = ref(0)
const previewResultIndex = ref(0)
const previewOpen = ref(false)
const detail = ref<InstanceType<typeof TaskDetailDialog>>()
const selected = ref<TaskItem | null>(null)
const publishOpen = ref(false)
const publishTask = ref<TaskItem | null>(null)
const unavailable = ref(new Set<string>())
const liveTasks = computed(() => tm.tasks.value.filter(t => t.feature_id === 'free-gen' || !t.feature_id))
const tasks = computed(() => {
  const merged = new Map(history.value.map(t => [t.id, t]))
  // Global manager owns submission and polling; its active objects always win.
  for (const task of liveTasks.value) {
    if (!task.id) continue
    const saved = merged.get(task.id)
    if (!saved || ['submitted', 'queued', 'in_progress', 'importing'].includes(task.status) || ['submitted', 'queued', 'in_progress', 'importing'].includes(saved.status)) merged.set(task.id, task)
  }
  return [...liveTasks.value.filter(t => !t.id), ...merged.values()]
    .sort((a, b) => parseUTC(b.created_at) - parseUTC(a.created_at))
})
const rounds = computed(() => {
  const groups = new Map<string, { key: string; createdAt: string; items: { task: TaskItem; url: string; index: number; key: string }[] }>()
  tasks.value.forEach((task, taskIndex) => {
    const key = task.client_business_id?.startsWith('free-gen:') ? task.client_business_id : `task:${task.id || `pending-${taskIndex}`}`
    let group = groups.get(key)
    if (!group) { group = { key, createdAt: task.created_at, items: [] }; groups.set(key, group) }
    if (parseUTC(task.created_at) < parseUTC(group.createdAt)) group.createdAt = task.created_at
    const urls = task.result_image_urls?.length ? task.result_image_urls : ['']
    urls.forEach((url, index) => group!.items.push({ task, url, index, key: `${task.id || `pending-${taskIndex}`}:${index}` }))
  })
  return [...groups.values()].sort((a, b) => parseUTC(b.createdAt) - parseUTC(a.createdAt))
})
const selectedTask = computed(() => tasks.value.find(t => t.id === selected.value?.id) || selected.value)
const labels: Record<string, string> = { submitted: '已提交', queued: '排队中', in_progress: '生成中', importing: '正在保存图片', failed: '生成失败', completed: '图片已就绪' }
let timer: ReturnType<typeof setInterval> | undefined
let inFlight = false
async function load(more = false, quiet = false) {
  if (inFlight) return
  inFlight = true
  if (!quiet) loading.value = true
  const target = more ? page.value + 1 : 1
  try {
    const response = await generationApi.list({ feature_id: 'free-gen', page: target, pageSize: more ? 30 : page.value * 30 })
    const data = response.data.data
    const records = data.records.map(r => ({ ...r, aspectRatio: r.aspectRatio ?? r.aspect_ratio, task_no: r.taskNo ?? r.task_no })) as TaskItem[]
    history.value = more ? [...history.value, ...records] : records
    if (more) page.value = target
    total.value = data.total
    loadError.value = false
  } catch { if (!quiet) loadError.value = true }
  finally { inFlight = false; loading.value = false }
}
function start() { if (timer) return; void load(); timer = setInterval(() => { void load(false, true) }, 8000) }
function stop() { clearInterval(timer); timer = undefined }
onMounted(start)
onActivated(start)
onDeactivated(stop)
onUnmounted(stop)
async function showDetail(task: TaskItem) { selected.value = task; await nextTick(); detail.value?.open() }
async function download(task: TaskItem, url: string, index: number) {
  try { await downloadUrl(url, `${task.task_no || task.id}-${index + 1}.png`) } catch (e) { feedback.error(e) }
}
function preview(task: TaskItem, index: number) { previewTaskId.value = task.id; previewIndex.value = tasks.value.indexOf(task); previewResultIndex.value = index; previewOpen.value = true }
function reuse(task: TaskItem) { emit('reuse', task); detail.value?.close() }
</script>

<template>
  <section class="studio-results-panel" aria-label="创作结果">
    <header><h2>创作结果</h2></header>
    <div class="results-scroll">
      <div v-if="loading && !tasks.length" class="results-empty" role="status"><LoaderCircle class="animate-spin" />正在加载创作记录</div>
      <div v-else-if="loadError && !tasks.length" class="results-empty" role="alert"><CircleAlert />创作记录加载失败<Button variant="outline" @click="load()">重新加载</Button></div>
      <div v-else-if="!tasks.length" class="results-empty"><Image :size="40" /><h3>下一张好图，从你的想法开始。</h3><p>添加参考图片或写下画面描述，结果会显示在这里。</p></div>
      <div v-else class="result-grid">
        <article v-for="round in rounds" :key="round.key" class="result-task">
          <time>{{ toBJMinute(round.createdAt) }}</time>
          <div class="round-images" tabindex="0" :aria-label="`${toBJMinute(round.createdAt)} 提交的图片，可左右滚动`">
          <div v-for="{ task, url, index, key } in round.items" :key="key" class="result-tile">
            <button v-if="url" class="result-image" :aria-label="`预览图片 ${task.task_no || task.id}-${index + 1}`" @click="preview(task, index)">
              <img v-if="!unavailable.has(url)" :src="url" alt="生成结果" loading="lazy" @error="unavailable.add(url)" />
              <span v-else class="image-fallback"><Image />图片暂时无法加载</span>
            </button>
            <div v-else class="result-placeholder" role="status"><CircleAlert v-if="task.status === 'failed'" /><LoaderCircle v-else class="animate-spin" /><span>{{ labels[task.status] || '等待结果' }}</span><span v-if="task.progress > 0 && task.status !== 'failed'">{{ task.progress }}%</span></div>
            <div class="result-actions" aria-label="图片操作">
              <button :disabled="!url" aria-label="下载" title="下载" @click="download(task, url, index)"><Download :size="14" /></button>
              <button aria-label="重新编辑" title="重新编辑" @click="reuse(task)"><RotateCcw :size="14" /></button>
              <button aria-label="详情" title="详情" @click="showDetail(task)"><Info :size="14" /></button>
            </div>
          </div>
          </div>
        </article>
      </div>
      <Button v-if="history.length < total" variant="ghost" class="load-more" :disabled="loading" @click="load(true)">{{ loading ? '加载中…' : '加载更多' }}</Button>
    </div>
    <ImageCompareDialog v-model="previewOpen" :tasks="tasks" :task-id="previewTaskId" :initial-index="previewIndex" :initial-result-index="previewResultIndex" studio />
    <TaskDetailDialog ref="detail" :task="selectedTask" @publish="(task) => { publishTask = task; publishOpen = true }">
      <template #actions>
        <template v-if="selectedTask">
          <Button variant="outline" @click="reuse(selectedTask)">重新编辑</Button>
          <Button v-if="selectedTask.status === 'failed'" variant="outline" @click="tm.handleRegenerate(selectedTask)">重试生成</Button>
          <Button v-if="selectedTask.status === 'completed' && selectedTask.error_message" variant="outline" @click="tm.retryImportTask(selectedTask)">重新导入</Button>
          <Button v-if="selectedTask.result_image_urls?.[0]" variant="outline" @click="reuse({ ...selectedTask, input_image_urls: [selectedTask.result_image_urls[0]] })">用作参考</Button>
        </template>
      </template>
    </TaskDetailDialog>
    <PublishWorkDialog v-model:visible="publishOpen" :task="publishTask" />
  </section>
</template>

<style scoped>
.studio-results-panel{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--momo-color-bg);border:1px solid var(--momo-color-border-soft);border-radius:var(--momo-space-5);overflow:hidden;container-type:inline-size}
header{padding:var(--momo-space-7);padding-bottom:var(--momo-space-5);flex-shrink:0}
h2{font-size:var(--momo-font-size-xl);font-weight:var(--momo-font-weight-semibold);margin:0}
.results-scroll{flex:1;min-height:0;overflow:auto;padding:0 var(--momo-space-7) var(--momo-space-7)}
.result-grid{display:flex;flex-direction:column;gap:var(--momo-space-3)}
.round-images{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 3 * var(--momo-space-2)) / 4);gap:var(--momo-space-2);overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity}
.round-images>.result-tile{scroll-snap-align:start;min-width:0}
.result-task{min-width:0;border-top:1px solid var(--momo-color-border-soft);padding-top:var(--momo-space-2)}
time{display:flex;flex-wrap:wrap;gap:0 var(--momo-space-1);font-size:var(--momo-font-size-xs);color:var(--momo-color-text-tertiary);margin-bottom:var(--momo-space-2);overflow-wrap:anywhere}
.result-tile{position:relative}
.result-image,.result-placeholder{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1;border-radius:var(--momo-radius-xl);overflow:hidden;background:var(--momo-color-bg-soft)}
.result-image img{width:100%;height:100%;object-fit:cover}
.result-placeholder,.image-fallback{display:flex;flex-direction:column;align-items:center;gap:var(--momo-space-2);font-size:var(--momo-font-size-xs);color:var(--momo-color-text-secondary)}
.result-actions{position:absolute;inset:auto 0 0;display:flex;background:var(--momo-color-bg);border-radius:var(--momo-radius-lg);box-shadow:var(--momo-shadow-sm);padding:var(--momo-space-1);opacity:0;pointer-events:none;transition:opacity .15s}
.result-tile:hover .result-actions,.result-tile:focus-within .result-actions{opacity:1;pointer-events:auto}
.result-actions button{display:flex;align-items:center;justify-content:center;gap:var(--momo-space-1);flex:1;min-width:0;padding:var(--momo-space-2) 0;font-size:var(--momo-font-size-xs);white-space:nowrap;border-radius:var(--momo-radius-sm)}
.result-actions button:hover{color:var(--momo-color-brand);background:var(--momo-color-bg-soft)}
.result-actions button:disabled{opacity:.4;cursor:not-allowed}
.results-empty{height:100%;min-height:var(--momo-space-16);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--momo-space-4);text-align:center;color:var(--momo-color-text-secondary)}
.results-empty h3{font-size:var(--momo-font-size-lg);color:var(--momo-color-text)}
.results-empty p{font-size:var(--momo-font-size-sm)}
.load-more{width:100%;margin-top:var(--momo-space-4)}

@media(max-width:600px){header,.results-scroll{padding:var(--momo-space-4)}}
@media(hover:none){.result-actions{opacity:1;pointer-events:auto}}
@media(prefers-reduced-motion:reduce){.result-actions{transition:none}}
</style>
