<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Edit } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { rfCanvasApi, type RfProject } from '@/services/rfCanvasApi'
import { toBJDate } from '@/utils/datetime'

defineOptions({ name: 'RfCanvasProjects' })

const router = useRouter()
const { success, error: showError, confirmDanger } = useUiFeedback()

const PRESET_COLORS = [
  '#0088ff', '#31c19e', '#fa742b', '#ff4d4f', '#722ed1',
  '#00b0ff', '#c32bac', '#52c41a', '#13c2c2', '#fa8c16',
]

const projects = ref<RfProject[]>([])
const loading = ref(true)
const showCreateDialog = ref(false)
const createName = ref('')
const creating = ref(false)
const showRenameDialog = ref(false)
const renamingId = ref(0)
const renameName = ref('')
const saving = ref(false)

async function loadProjects() {
  loading.value = true
  try {
    projects.value = await rfCanvasApi.listProjects()
  } catch {
    showError('加载项目列表失败')
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  createName.value = ''
  showCreateDialog.value = true
}

async function handleCreate() {
  if (!createName.value.trim()) return
  creating.value = true
  try {
    const project = await rfCanvasApi.createProject(createName.value.trim())
    showCreateDialog.value = false
    success('项目已创建')
    router.push(`/rf-canvas/${project.id}`)
  } catch {
    showError('创建项目失败')
  } finally {
    creating.value = false
  }
}

function openProject(id: number) {
  router.push(`/rf-canvas/${id}`)
}

function openRenameDialog(project: RfProject) {
  renamingId.value = project.id
  renameName.value = project.name
  showRenameDialog.value = true
}

async function handleRename() {
  if (!renameName.value.trim()) return
  saving.value = true
  try {
    await rfCanvasApi.renameProject(renamingId.value, renameName.value.trim())
    showRenameDialog.value = false
    success('项目已重命名')
    await loadProjects()
  } catch {
    showError('重命名失败')
  } finally {
    saving.value = false
  }
}

async function duplicateProject(id: number) {
  try {
    await rfCanvasApi.duplicateProject(id)
    success('项目已复制')
    await loadProjects()
  } catch {
    showError('复制项目失败')
  }
}

async function deleteProject(project: RfProject) {
  try {
    await confirmDanger({
      message: `确定要删除项目"${project.name}"吗？此操作不可恢复。`,
      confirmText: '删除',
    })
    await rfCanvasApi.deleteProject(project.id)
    success('项目已删除')
    await loadProjects()
  } catch {
    // user cancelled
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

function thumbnailColor(project: RfProject): string {
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
        description="还没有项目，点击「新建项目」开始创建你的第一个 AI画布 Pro+ 工作流。"
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
            <div class="project-card__meta">
              <span>{{ formatTime(project.updatedAt) }}</span>
              <span v-if="project.nodeCount > 0">{{ project.nodeCount }} 个节点</span>
            </div>
          </div>

          <div class="project-card__actions" @click.stop>
            <el-button size="small" @click="openProject(project.id)">打开</el-button>
            <el-button size="small" :icon="Edit" @click="openRenameDialog(project)">重命名</el-button>
            <el-button size="small" @click="duplicateProject(project.id)">复制</el-button>
            <el-button size="small" type="danger" @click="deleteProject(project)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      title="新建画布项目"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="handleCreate">
        <el-form-item label="项目名称" required>
          <el-input
            v-model="createName"
            placeholder="请输入项目名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!createName.trim()"
          @click="handleCreate"
        >
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- Rename Dialog -->
    <el-dialog
      v-model="showRenameDialog"
      title="重命名项目"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="handleRename">
        <el-form-item label="项目名称" required>
          <el-input
            v-model="renameName"
            placeholder="请输入项目名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!renameName.trim()"
          @click="handleRename"
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
</style>
