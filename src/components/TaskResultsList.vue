<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, nextTick } from 'vue'
import { Image, LoaderCircle, CircleAlert } from '@lucide/vue'
import { generationApi } from '@/services/generationApi'
import { useTaskManager } from '@/composables/useTaskManager'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { downloadUrl } from '@/utils/download'
import { toBJMinute, parseUTC } from '@/utils/datetime'
import type { TaskItem } from '@/components/TaskList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import ImageCompareDialog from '@/components/ImageCompareDialog.vue'
import { Button, DsImageCard, DsResultGroup } from '@/components/design-system'

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
const unavailable = ref(new Set<string>())
const liveTasks = computed(() => tm.tasks.value)
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
    const key = task.client_business_id || `task:${task.id || `pending-${taskIndex}`}`
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
    const response = await generationApi.list({ page: target, pageSize: more ? 30 : page.value * 30 })
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
  <section class="ds-results-panel task-results-list" aria-label="新版任务列表">
    <div class="ds-results-scroll pt-3">
      <div v-if="loading && !tasks.length" class="ds-results-empty" role="status"><LoaderCircle class="animate-spin" />正在加载任务</div>
      <div v-else-if="loadError && !tasks.length" class="ds-results-empty" role="alert"><CircleAlert />任务加载失败<Button variant="outline" @click="load()">重新加载</Button></div>
      <div v-else-if="!tasks.length" class="ds-results-empty"><Image :size="40" /><h3>暂无任务</h3><p>开始生成后，任务结果会显示在这里。</p></div>
      <div v-else class="ds-result-list">
        <DsResultGroup v-for="round in rounds" :key="round.key" :label="toBJMinute(round.createdAt)" compact>
          <DsImageCard v-for="{ task, url, index, key } in round.items" :key="key" :src="url" :title="`图片 ${task.task_no || task.id}-${index + 1}`" external-preview :loading="!url && task.status !== 'failed'" :status-label="labels[task.status] || '等待结果'" :progress="task.progress" @preview="preview(task,index)" @download="download(task,url,index)" @edit="reuse(task)" @detail="showDetail(task)" />
        </DsResultGroup>
      </div>
      <Button v-if="history.length < total" variant="ghost" class="w-full" :disabled="loading" @click="load(true)">{{ loading ? '加载中…' : '加载更多' }}</Button>
    </div>
    <ImageCompareDialog v-model="previewOpen" :tasks="tasks" :task-id="previewTaskId" :initial-index="previewIndex" :initial-result-index="previewResultIndex" studio />
    <TaskDetailDialog ref="detail" :task="selectedTask">
      <template #actions>
        <template v-if="selectedTask">
          <Button variant="outline" @click="reuse(selectedTask)">重新编辑</Button>
          <Button v-if="selectedTask.status === 'failed'" variant="outline" @click="tm.handleRegenerate(selectedTask)">重试生成</Button>
          <Button v-if="selectedTask.status === 'completed' && selectedTask.error_message" variant="outline" @click="tm.retryImportTask(selectedTask)">重新导入</Button>
          <Button v-if="selectedTask.result_image_urls?.[0]" variant="outline" @click="reuse({ ...selectedTask, input_image_urls: [selectedTask.result_image_urls[0]] })">用作参考</Button>
        </template>
      </template>
    </TaskDetailDialog>
  </section>
</template>

<style scoped>
.task-results-list { height: 100%; border: 0; border-radius: 0; }
</style>
