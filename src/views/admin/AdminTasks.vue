<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { MODELS } from '@/types/adapter'

interface TaskRow {
  id: number
  username: string
  user_id: number
  toapis_task_id: string
  model: string
  prompt: string
  status: string
  progress: number
  created_at: string
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
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户" width="100" />
      <el-table-column prop="toapis_task_id" label="ToAPIs ID" width="200" show-overflow-tooltip />
      <el-table-column label="模型" width="150">
        <template #default="{ row }">
          {{ MODELS.find((m) => m.id === row.model)?.name || row.model }}
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
.filters { display: flex; gap: 8px; }
.pagination-wrap { margin-top: 16px; display: flex; justify-content: center; }
</style>
