<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Edit } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { canvasApi, type CanvasProject } from '@/services/canvasApi'
import { toBJDate } from '@/utils/datetime'

defineOptions({ name: 'CanvasProjects' })

const router = useRouter()
const { success, error: showError, confirmDanger } = useUiFeedback()

const PRESET_COLORS = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#9266F5',
  '#20A0C8', '#E040A0', '#8B7FFF', '#36CFC9', '#FF7A45',
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
    <template #header>
      <div class="projects-toolbar">
        <el-button :icon="Plus" type="primary" @click="openCreateDialog">新建项目</el-button>
        <el-button :icon="Refresh" @click="loadProjects">刷新</el-button>
      </div>
    </template>

    <div v-loading="loading" class="projects-content">
      <el-empty
        v-if="!loading && projects.length === 0"
        description="还没有项目，点击「新建项目」开始创建你的第一个画布。"
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
            <el-button size="small" @click="openProject(project.id)">打开</el-button>
            <el-button size="small" :icon="Edit" @click="openEditDialog(project)">编辑</el-button>
            <el-button size="small" @click="duplicateProject(project.id)">复制</el-button>
            <el-button size="small" type="danger" @click="deleteProject(project)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      title="新建项目"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="handleCreate">
        <el-form-item label="项目名称" required>
          <el-input
            v-model="createForm.name"
            placeholder="请输入项目名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="createForm.description"
            type="textarea"
            placeholder="请输入项目描述（选填）"
            maxlength="200"
            show-word-limit
            :rows="2"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="createForm.notes"
            type="textarea"
            placeholder="请输入备注（选填）"
            maxlength="500"
            show-word-limit
            :rows="3"
          />
        </el-form-item>
        <el-form-item label="缩略图颜色">
          <div class="color-picker">
            <div
              v-for="c in PRESET_COLORS"
              :key="c"
              class="color-swatch"
              :class="{ selected: createForm.thumbnailColor === c }"
              :style="{ backgroundColor: c }"
              @click="createForm.thumbnailColor = c"
            />
            <div
              class="color-swatch color-swatch--random"
              :class="{ selected: !createForm.thumbnailColor }"
              @click="createForm.thumbnailColor = ''"
            >
              <span>随机</span>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!createForm.name.trim()"
          @click="handleCreate"
        >
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit Dialog -->
    <el-dialog
      v-model="showEditDialog"
      title="编辑项目"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="handleEdit">
        <el-form-item label="项目名称" required>
          <el-input
            v-model="editForm.name"
            placeholder="请输入项目名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="editForm.description"
            type="textarea"
            placeholder="请输入项目描述（选填）"
            maxlength="200"
            show-word-limit
            :rows="2"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="editForm.notes"
            type="textarea"
            placeholder="请输入备注（选填）"
            maxlength="500"
            show-word-limit
            :rows="3"
          />
        </el-form-item>
        <el-form-item label="缩略图颜色">
          <div class="color-picker">
            <div
              v-for="c in PRESET_COLORS"
              :key="c"
              class="color-swatch"
              :class="{ selected: editForm.thumbnailColor === c }"
              :style="{ backgroundColor: c }"
              @click="editForm.thumbnailColor = c"
            />
            <div
              class="color-swatch color-swatch--random"
              :class="{ selected: !editForm.thumbnailColor }"
              @click="editForm.thumbnailColor = ''"
            >
              <span>随机</span>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!editForm.name.trim()"
          @click="handleEdit"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
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
  border-radius: var(--momo-radius-lg);
  border: 1px solid var(--el-border-color-light);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
  background: var(--el-bg-color);
}

.project-card:hover {
  box-shadow: var(--el-box-shadow);
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
  color: var(--momo-overlay-text);
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
  font-size: var(--el-font-size-base);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-card__desc,
.project-card__notes {
  margin: 0 0 4px;
  font-size: var(--el-font-size-small);
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-card__notes {
  color: var(--el-text-color-placeholder);
  -webkit-line-clamp: 1;
}

.project-card__meta {
  margin-top: 8px;
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-placeholder);
  display: flex;
  justify-content: space-between;
}

.project-card__actions {
  position: absolute;
  inset: 0;
  background: var(--momo-overlay-dim);
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

.color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: var(--momo-radius-md);
  cursor: pointer;
  border: 3px solid transparent;
  transition: border-color 0.2s;
}

.color-swatch:hover {
  border-color: var(--el-border-color-darker);
}

.color-swatch.selected {
  border-color: var(--el-color-primary);
}

.color-swatch--random {
  background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  padding: 0 8px;
}

.color-swatch--random span {
  font-size: var(--el-font-size-extra-small);
  color: var(--momo-overlay-text);
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
}
</style>
