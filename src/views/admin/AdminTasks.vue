<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'

const modelCatalog = useModelCatalogStore()

interface TaskRow {
  id: number
  username: string
  user_id: number
  task_no: string | null
  provider_task_id?: string | null
  toapis_task_id?: string
  model: string
  prompt: string
  status: string
  progress: number
  created_at: string
  route_attempts?: Array<{
    id: number
    attempt_no: number
    provider_name: string | null
    channel_model_name: string | null
    key_name: string | null
    cost_price: number
    status: string
    error_message: string | null
  }>
}

const tasks = ref<TaskRow[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterStatus = ref('')
const filterUserId = ref('')

const statusMap: Record<string, string> = {
  submitted: '已提交', queued: '排队中', in_progress: '生成中',
  completed: '已完成', failed: '生成失败',
}

async function loadTasks() {
  loading.value = true
  try {
    const res = await adminApi.listTasks({
      page: page.value,
      pageSize: pageSize.value,
      status: filterStatus.value || undefined,
      user_id: filterUserId.value ? Number(filterUserId.value) : undefined,
    })
    const data = res.data.data
    tasks.value = data.records || []
    total.value = data.total || 0
  } catch {
    error('加载任务列表失败')
  } finally {
    loading.value = false
  }
}

async function handleDelete(task: TaskRow) {
  try {
    await confirmDanger({ title: '确认删除', message: '确定删除该任务记录吗？' })
    await adminApi.deleteTask(task.id)
    success('已删除')
    await loadTasks()
  } catch { /* cancelled */ }
}

onMounted(() => loadTasks())

import { watch } from 'vue'
watch([filterStatus, filterUserId], () => { page.value = 1; loadTasks() })
</script>

<template>
  <PageLayout>
    <template #header><h2>任务管理（全部用户）</h2></template>
    <template #extra>
      <div class="filters">
        <el-select v-model="filterStatus" placeholder="状态筛选" clearable size="small" style="width: 120px">
          <el-option v-for="(label, key) in statusMap" :key="key" :label="label" :value="key" />
        </el-select>
        <el-input v-model="filterUserId" placeholder="用户ID" clearable size="small" style="width: 120px" />
        <el-button size="small" @click="loadTasks">刷新</el-button>
      </div>
    </template>

    <el-table :data="tasks" v-loading="loading" stripe>
      <el-table-column type="expand" width="44">
        <template #default="{ row }">
          <el-table v-if="row.route_attempts?.length" :data="row.route_attempts" size="small" class="attempt-table">
            <el-table-column prop="attempt_no" label="#" width="52" />
            <el-table-column prop="provider_name" label="渠道" min-width="130" />
            <el-table-column prop="channel_model_name" label="渠道模型" min-width="150" />
            <el-table-column prop="key_name" label="Key" min-width="120" />
            <el-table-column label="成本" width="100"><template #default="scope">¥{{ scope.row.cost_price }}</template></el-table-column>
            <el-table-column label="结果" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.status === 'succeeded' ? 'success' : scope.row.status === 'failed' ? 'danger' : 'info'" size="small">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="error_message" label="错误" min-width="220" show-overflow-tooltip />
          </el-table>
          <el-empty v-else description="该任务没有路由记录" :image-size="48" />
        </template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户" width="100" />
      <el-table-column prop="task_no" label="任务ID" width="170" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="task-no">{{ row.task_no || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="渠道任务ID" width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="task-no">{{ row.provider_task_id || row.toapis_task_id || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="模型" width="150">
        <template #default="{ row }">
          {{ modelCatalog.displayNameFor(row.model) }}
        </template>
      </el-table-column>
      <el-table-column prop="prompt" label="提示词" min-width="200" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'info'" size="small">
            {{ statusMap[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="提交时间" width="140">
        <template #default="{ row }">{{ toBJMinute(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-popconfirm title="确定删除？" @confirm="handleDelete(row)">
            <template #reference>
              <el-button type="danger" size="small" plain>删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

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
</template>

<style scoped>
.filters { display: flex; gap: var(--momo-space-2); }
.attempt-table { margin: var(--momo-space-2) var(--momo-space-4); width: calc(100% - var(--momo-space-8)); }
.pagination-wrap { margin-top: var(--momo-space-4); display: flex; justify-content: center; }
</style>
