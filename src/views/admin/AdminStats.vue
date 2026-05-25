<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'

interface StatRow {
  user_id: number
  username: string
  role: string
  status: string
  submitted_count: number
  completed_count: number
  failed_count: number
  last_submitted_at: string | null
  last_completed_at: string | null
}

const stats = ref<StatRow[]>([])
const loading = ref(false)

async function loadStats() {
  loading.value = true
  try {
    const res = await adminApi.getStats()
    stats.value = res.data.data || []
  } catch {
    ElMessage.error('加载统计失败')
  } finally {
    loading.value = false
  }
}

const totalSubmitted = ref(0)
const totalCompleted = ref(0)
const totalFailed = ref(0)

import { watch } from 'vue'
watch(stats, (s) => {
  totalSubmitted.value = s.reduce((sum, r) => sum + r.submitted_count, 0)
  totalCompleted.value = s.reduce((sum, r) => sum + r.completed_count, 0)
  totalFailed.value = s.reduce((sum, r) => sum + r.failed_count, 0)
})

onMounted(() => loadStats())
</script>

<template>
  <PageLayout>
    <template #header><h2>生成统计</h2></template>

    <!-- Summary Cards -->
    <el-row :gutter="16" style="margin-bottom: 24px">
      <el-col :span="8">
        <el-statistic title="总提交次数" :value="totalSubmitted" />
      </el-col>
      <el-col :span="8">
        <el-statistic title="总成功次数" :value="totalCompleted" />
      </el-col>
      <el-col :span="8">
        <el-statistic title="总失败次数" :value="totalFailed" />
      </el-col>
    </el-row>

    <el-table :data="stats" v-loading="loading" stripe>
      <el-table-column prop="username" label="用户名" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
            {{ row.status === 'active' ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交次数" width="120" prop="submitted_count" sortable />
      <el-table-column label="成功次数" width="120" prop="completed_count" sortable />
      <el-table-column label="失败次数" width="120" prop="failed_count" sortable />
      <el-table-column label="最近提交" width="160">
        <template #default="{ row }">{{ row.last_submitted_at?.slice(0, 16) || '-' }}</template>
      </el-table-column>
      <el-table-column label="最近完成" width="160">
        <template #default="{ row }">{{ row.last_completed_at?.slice(0, 16) || '-' }}</template>
      </el-table-column>
    </el-table>
  </PageLayout>
</template>
