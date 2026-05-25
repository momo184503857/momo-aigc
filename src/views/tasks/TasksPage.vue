<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { List, Grid } from '@element-plus/icons-vue'
import { taskApi } from '@/services/taskApi'
import TaskList from '@/components/TaskList.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import PageLayout from '@/components/PageLayout.vue'
import type { TaskItem } from '@/components/TaskList.vue'
import type { ModelId } from '@/types/adapter'
import { MODELS } from '@/types/adapter'

const tasks = ref<TaskItem[]>([])
const loading = ref(false)
const viewMode = ref<'list' | 'grid'>('list')
const filterStatus = ref<string>('')
const filterModel = ref<string>('')

const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

async function loadTasks() {
  loading.value = true
  try {
    const res = await taskApi.list({
      page: page.value,
      pageSize: pageSize.value,
      status: filterStatus.value || undefined,
      model: filterModel.value || undefined,
    })
    tasks.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
  } catch {
    ElMessage.error('加载任务历史失败')
  } finally {
    loading.value = false
  }
}

// Regenerate: navigate to workspace with params
// For simplicity, just show a message
function handleRegenerate(task: TaskItem) {
  ElMessage.info('请切换到生图工作台页面，从历史任务中点击重新生成')
}

async function handleDelete(task: TaskItem) {
  try {
    await ElMessageBox.confirm('确定删除该任务记录吗？', '确认删除', {
      type: 'warning',
    })
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    ElMessage.success('已移除')
  } catch { /* cancelled */ }
}

const detailTask = ref<TaskItem | null>(null)

function showDetail(task: TaskItem) {
  detailTask.value = task
}

onMounted(() => loadTasks())

// Reload on filter change
import { watch } from 'vue'
watch([filterStatus, filterModel], () => {
  page.value = 1
  loadTasks()
})
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>任务历史</h2>
    </template>
    <template #extra>
      <div class="filters">
        <el-select v-model="filterStatus" placeholder="状态筛选" clearable size="small" style="width: 120px">
          <el-option label="已提交" value="submitted" />
          <el-option label="排队中" value="queued" />
          <el-option label="生成中" value="in_progress" />
          <el-option label="已完成" value="completed" />
          <el-option label="失败" value="failed" />
        </el-select>
        <el-select v-model="filterModel" placeholder="模型筛选" clearable size="small" style="width: 200px">
          <el-option v-for="m in MODELS" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
        <el-button-group size="small">
          <el-button :type="viewMode === 'list' ? 'primary' : 'default'" @click="viewMode = 'list'">
            <el-icon><List /></el-icon>
          </el-button>
          <el-button :type="viewMode === 'grid' ? 'primary' : 'default'" @click="viewMode = 'grid'">
            <el-icon><Grid /></el-icon>
          </el-button>
        </el-button-group>
      </div>
    </template>

    <TaskList
      :tasks="tasks"
      :view-mode="viewMode"
      :loading="loading"
      @regenerate="handleRegenerate"
      @delete="handleDelete"
      @view-detail="showDetail"
    />

    <div v-if="total > pageSize" class="pagination-wrap">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        @current-change="loadTasks"
      />
    </div>
  </PageLayout>

  <TaskDetailDialog v-if="detailTask" :task="detailTask" @close="detailTask = null" />
</template>

<style scoped>
.filters { display: flex; gap: 8px; align-items: center; }
.pagination-wrap {
  display: flex; justify-content: center;
  margin-top: 20px; padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
