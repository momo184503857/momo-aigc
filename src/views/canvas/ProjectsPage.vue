<script setup lang="ts">
import { DsColorPicker } from '@/components/design-system'
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, RefreshCw, Pencil, LoaderCircle } from '@lucide/vue'
import { DsScrollPage as PageLayout } from '@/components/design-system'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { canvasApi, type CanvasProject } from '@/services/canvasApi'
import { toBJDate } from '@/utils/datetime'
import { Button } from '@/components/design-system/primitives/button'
import { Input } from '@/components/design-system/primitives/input'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { Label } from '@/components/design-system/primitives/label'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { UiEmptyState } from '@/components/design-system'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/design-system/primitives/dialog'

defineOptions({ name: 'CanvasProjects' })

const router = useRouter()
const { success, error: showError, confirmDanger } = useUiFeedback()

// 项目缩略图预设色板：DDB 业务语义色 + 扩展强调色（分类/装饰用途）
const PRESET_COLORS = [
  '#0088ff', '#31c19e', '#fa742b', '#ff4d4f', '#722ed1',
  '#00b0ff', '#c32bac', '#52c41a', '#13c2c2', '#fa8c16',
]

const projects = ref<CanvasProject[]>([])
const loading = ref(true)
const showCreateDialog = ref(false)
const createForm = ref({ name: '', description: '', notes: '', thumbnailColor: '' })
const creating = ref(false)

async function loadProjects() {
  loading.value = true
  try {
    projects.value = await canvasApi.listProjects()
  } catch {
    showError('加载项目列表失败')
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  createForm.value = { name: '', description: '', notes: '', thumbnailColor: '' }
  showCreateDialog.value = true
}

async function handleCreate() {
  if (!createForm.value.name.trim()) return
  creating.value = true
  try {
    const project = await canvasApi.createProject({
      name: createForm.value.name.trim(),
      description: createForm.value.description.trim(),
      notes: createForm.value.notes.trim(),
      thumbnail: createForm.value.thumbnailColor || undefined,
      workflowData: JSON.stringify({
        id: '',
        name: createForm.value.name.trim(),
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
      }),
    })
    showCreateDialog.value = false
    success('项目已创建')
    router.push(`/ai-canvas/${project.id}`)
  } catch {
    showError('创建项目失败')
  } finally {
    creating.value = false
  }
}

function openProject(id: number) {
  router.push(`/ai-canvas/${id}`)
}

async function duplicateProject(id: number) {
  try {
    await canvasApi.duplicateProject(id)
    success('项目已复制')
    await loadProjects()
  } catch {
    showError('复制项目失败')
  }
}

async function deleteProject(project: CanvasProject) {
  try {
    await confirmDanger({
      message: `确定要删除项目"${project.name}"吗？此操作不可恢复。`,
      confirmText: '删除',
    })
    await canvasApi.deleteProject(project.id)
    success('项目已删除')
    await loadProjects()
  } catch {
    // user cancelled
  }
}

const showEditDialog = ref(false)
const editingProjectId = ref(0)
const editForm = ref({ name: '', description: '', notes: '', thumbnailColor: '' })
const saving = ref(false)

function openEditDialog(project: CanvasProject) {
  editingProjectId.value = project.id
  editForm.value = {
    name: project.name,
    description: project.description,
    notes: project.notes,
    thumbnailColor: project.thumbnail || '',
  }
  showEditDialog.value = true
}

async function handleEdit() {
  if (!editForm.value.name.trim()) return
  saving.value = true
  try {
    await canvasApi.updateProject(editingProjectId.value, {
      name: editForm.value.name.trim(),
      description: editForm.value.description.trim(),
      notes: editForm.value.notes.trim(),
      thumbnail: editForm.value.thumbnailColor || undefined,
    })
    showEditDialog.value = false
    success('项目信息已更新')
    await loadProjects()
  } catch {
    showError('更新项目失败')
  } finally {
    saving.value = false
  }
}

function formatTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return toBJDate(isoString)
}

function thumbnailColor(project: CanvasProject): string {
  if (project.thumbnail && /^#[0-9A-Fa-f]{6}$/.test(project.thumbnail)) {
    return project.thumbnail
  }
  let hash = 0
  for (let i = 0; i < project.name.length; i++) {
    hash = project.name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PRESET_COLORS[Math.abs(hash) % PRESET_COLORS.length]
}

onMounted(() => { loadProjects() })
onActivated(() => { loadProjects() })
</script>

<template>
  <PageLayout content-padding="0">
    <template #actions>
      <div class="projects-toolbar">
        <Button @click="openCreateDialog"><Plus />新建项目</Button>
        <Button variant="outline" @click="loadProjects"><RefreshCw />刷新</Button>
      </div>
    </template>

    <div class="projects-content">
      <div v-if="loading" class="projects-grid">
        <div v-for="i in 4" :key="i" class="flex flex-col gap-2">
          <Skeleton class="h-35 w-full rounded-lg" />
          <Skeleton class="h-4 w-2/3" />
          <Skeleton class="h-3 w-1/2" />
        </div>
      </div>
      <UiEmptyState
        v-else-if="projects.length === 0"
        title="还没有项目，点击「新建项目」开始创建你的第一个画布。"
      />

      <div v-else class="projects-grid">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-card"
          @click="openProject(project.id)"
        >
          <div class="project-card__thumb" :style="{ backgroundColor: thumbnailColor(project) }">
            <span class="project-card__name-on-thumb">{{ project.name }}</span>
          </div>

          <div class="project-card__body">
            <h3 class="project-card__name">{{ project.name }}</h3>
            <p v-if="project.description" class="project-card__desc">{{ project.description }}</p>
            <p v-if="project.notes" class="project-card__notes">{{ project.notes }}</p>
            <div class="project-card__meta">
              <span>{{ formatTime(project.updated_at) }}</span>
              <span v-if="project.node_count > 0">{{ project.node_count }} 个节点</span>
            </div>
          </div>

          <div class="project-card__actions" @click.stop>
            <Button size="sm" @click="openProject(project.id)">打开</Button>
            <Button size="sm" variant="outline" @click="openEditDialog(project)"><Pencil />编辑</Button>
            <Button size="sm" variant="outline" @click="duplicateProject(project.id)">复制</Button>
            <Button size="sm" variant="destructive" @click="deleteProject(project)">删除</Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <Dialog :open="showCreateDialog" @update:open="(v: boolean) => (showCreateDialog = v)">
      <DialogContent class="sm:max-w-lg" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-4" @submit.prevent="handleCreate">
          <div class="grid gap-1.5">
            <Label for="create-name">项目名称 <span class="text-destructive">*</span></Label>
            <Input
              id="create-name"
              v-model="createForm.name"
              placeholder="请输入项目名称"
              maxlength="50"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="create-desc">描述</Label>
            <Textarea
              id="create-desc"
              v-model="createForm.description"
              placeholder="请输入项目描述（选填）"
              maxlength="200"
              :rows="2"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="create-notes">备注</Label>
            <Textarea
              id="create-notes"
              v-model="createForm.notes"
              placeholder="请输入备注（选填）"
              maxlength="500"
              :rows="3"
            />
          </div>
          <div class="grid gap-1.5">
            <Label>缩略图颜色</Label>
            <DsColorPicker v-model="createForm.thumbnailColor" :presets="PRESET_COLORS" allow-automatic />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false">取消</Button>
          <Button
            :disabled="creating || !createForm.name.trim()"
            @click="handleCreate"
          >
            <LoaderCircle v-if="creating" class="animate-spin" />
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit Dialog -->
    <Dialog :open="showEditDialog" @update:open="(v: boolean) => (showEditDialog = v)">
      <DialogContent class="sm:max-w-lg" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>编辑项目</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-4" @submit.prevent="handleEdit">
          <div class="grid gap-1.5">
            <Label for="edit-name">项目名称 <span class="text-destructive">*</span></Label>
            <Input
              id="edit-name"
              v-model="editForm.name"
              placeholder="请输入项目名称"
              maxlength="50"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="edit-desc">描述</Label>
            <Textarea
              id="edit-desc"
              v-model="editForm.description"
              placeholder="请输入项目描述（选填）"
              maxlength="200"
              :rows="2"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="edit-notes">备注</Label>
            <Textarea
              id="edit-notes"
              v-model="editForm.notes"
              placeholder="请输入备注（选填）"
              maxlength="500"
              :rows="3"
            />
          </div>
          <div class="grid gap-1.5">
            <Label>缩略图颜色</Label>
            <DsColorPicker v-model="editForm.thumbnailColor" :presets="PRESET_COLORS" allow-automatic />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" @click="showEditDialog = false">取消</Button>
          <Button
            :disabled="saving || !editForm.name.trim()"
            @click="handleEdit"
          >
            <LoaderCircle v-if="saving" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>

<style scoped>
.projects-toolbar {
  display: flex;
  gap: 8px;
}

.projects-content {
  min-height: 200px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.project-card {
  position: relative;
  border-radius: var(--ds-card-radius);
  border: 1px solid var(--border);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
  background: var(--card);
}

.project-card:hover {
  box-shadow: var(--ds-shadow);
  transform: translateY(-2px);
}

.project-card__thumb {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.project-card__name-on-thumb {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 10px;
  color: var(--ds-white);
  opacity: 0.9;
  user-select: none;
  text-align: center;
  padding: 0 16px;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-card__body {
  padding: 12px 16px 16px;
}

.project-card__name {
  margin: 0 0 4px;
  font-size: var(--ds-font-body);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-card__desc,
.project-card__notes {
  margin: 0 0 4px;
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-card__notes {
  color: var(--muted-foreground);
  -webkit-line-clamp: 1;
}

.project-card__meta {
  margin-top: 8px;
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
  display: flex;
  justify-content: space-between;
}

.project-card__actions {
  position: absolute;
  inset: 0;
  background: var(--ds-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.project-card:hover .project-card__actions {
  opacity: 1;
}

</style>
