<script setup lang="ts">
defineOptions({ name: 'AdminPoints' })
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { UiNumberInput } from '@/components/ui'

interface UserItem {
  id: number
  username: string
  role: string
  status: string
  points: number
  tags: string
  submitted_count: number
  total_spent?: number
  total_recharged?: number
}

const users = ref<UserItem[]>([])
const loading = ref(false)
const searchQuery = ref('')

// Points dialog
const pointsVisible = ref(false)
const pointsUserId = ref(0)
const pointsUsername = ref('')
const pointsAmount = ref(0)
const pointsNote = ref('')
const pointsLoading = ref(false)

async function loadUsers() {
  loading.value = true
  try {
    const params: any = {}
    if (searchQuery.value) params.search = searchQuery.value
    const res = await adminApi.listUsers(params)
    const list = res.data.data || []
    // Load full detail for each user to get total_spent/total_recharged
    for (const u of list) {
      try {
        const detail = await adminApi.getUser(u.id)
        u.total_spent = detail.data.data?.total_spent ?? 0
        u.total_recharged = detail.data.data?.total_recharged ?? 0
      } catch {
        u.total_spent = 0
        u.total_recharged = 0
      }
    }
    users.value = list
  } catch {
    error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

function openPoints(user: UserItem) {
  pointsUserId.value = user.id
  pointsUsername.value = user.username
  pointsAmount.value = 0
  pointsNote.value = ''
  pointsVisible.value = true
}

async function handleAdjustPoints() {
  if (pointsAmount.value === 0) {
    warning('请输入金额')
    return
  }
  pointsLoading.value = true
  try {
    await adminApi.adjustPoints(pointsUserId.value, pointsAmount.value, pointsNote.value)
    success(pointsAmount.value > 0 ? '充值成功' : '扣减成功')
    pointsVisible.value = false
    await loadUsers()
  } catch (e: any) {
    error(e.response?.data?.error || '操作失败')
  } finally {
    pointsLoading.value = false
  }
}

function handleSearch() {
  loadUsers()
}

onMounted(() => loadUsers())
</script>

<template>
  <PageLayout>
    <template #header><h2>积分管理</h2></template>

    <div style="margin-bottom:16px">
      <el-input
        v-model="searchQuery"
        placeholder="搜索用户名..."
        clearable
        style="width:240px"
        @change="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>

    <el-table :data="users" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
            {{ row.status === 'active' ? '正常' : '已禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="当前积分" width="120">
        <template #default="{ row }">
          <span :style="{ color: row.points <= 0 ? 'var(--el-color-danger)' : 'var(--el-color-primary)', fontWeight: 600, fontSize: '16px' }">
            {{ row.points }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="累计消耗" width="120">
        <template #default="{ row }">
          <span style="color:var(--el-color-danger)">-{{ Math.abs(row.total_spent || 0) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="累计充值" width="120">
        <template #default="{ row }">
          <span style="color:var(--el-color-success)">+{{ row.total_recharged || 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="提交次数" width="90" prop="submitted_count" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" type="success" plain @click="pointsAmount = 10; openPoints(row)">充值</el-button>
          <el-button size="small" type="danger" plain @click="openPoints(row)">扣减</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Points dialog -->
    <el-dialog v-model="pointsVisible" :title="`调整积分 - ${pointsUsername}`" width="400px">
      <el-form>
        <el-form-item label="金额（正数充值，负数扣减）">
          <UiNumberInput v-model="pointsAmount" :precision="3" :step="1" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="pointsNote" placeholder="可选：调整理由" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pointsVisible = false">取消</el-button>
        <el-button
          :type="pointsAmount > 0 ? 'success' : 'danger'"
          :loading="pointsLoading"
          @click="handleAdjustPoints"
        >
          {{ pointsAmount > 0 ? '充值' : pointsAmount < 0 ? '扣减' : '确认' }}
        </el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>
