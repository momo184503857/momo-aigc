<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'

interface UserItem {
  id: number
  username: string
  role: string
  status: string
  submitted_count: number
  completed_count: number
  failed_count: number
  last_submitted_at: string | null
  last_login_at: string | null
  created_at: string
}

const users = ref<UserItem[]>([])
const loading = ref(false)

// Create dialog
const createVisible = ref(false)
const createUsername = ref('')
const createPassword = ref('')
const createLoading = ref(false)

// Reset password dialog
const resetVisible = ref(false)
const resetUserId = ref(0)
const resetUsername = ref('')
const resetPassword = ref('')

async function loadUsers() {
  loading.value = true
  try {
    const res = await adminApi.listUsers()
    users.value = res.data.data || []
  } catch {
    ElMessage.error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!createUsername.value || !createPassword.value) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  createLoading.value = true
  try {
    await adminApi.createUser(createUsername.value, createPassword.value)
    ElMessage.success('创建成功')
    createVisible.value = false
    createUsername.value = ''
    createPassword.value = ''
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '创建失败')
  } finally {
    createLoading.value = false
  }
}

function openReset(user: UserItem) {
  resetUserId.value = user.id
  resetUsername.value = user.username
  resetPassword.value = ''
  resetVisible.value = true
}

async function handleReset() {
  if (!resetPassword.value) {
    ElMessage.warning('请输入新密码')
    return
  }
  try {
    await adminApi.resetPassword(resetUserId.value, resetPassword.value)
    ElMessage.success('密码已重置')
    resetVisible.value = false
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '重置失败')
  }
}

async function handleToggleStatus(user: UserItem) {
  const newStatus = user.status === 'active' ? 'disabled' : 'active'
  const action = newStatus === 'disabled' ? '禁用' : '启用'
  try {
    await ElMessageBox.confirm(`确定${action}用户 "${user.username}" 吗？`, `确认${action}`)
    await adminApi.updateUserStatus(user.id, newStatus)
    ElMessage.success(`已${action}`)
    await loadUsers()
  } catch { /* cancelled */ }
}

onMounted(() => loadUsers())
</script>

<template>
  <PageLayout>
    <template #header><h2>用户管理</h2></template>
    <template #extra>
      <el-button type="primary" @click="createVisible = true">创建用户</el-button>
    </template>

    <el-table :data="users" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column label="角色" width="80">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
            {{ row.role === 'admin' ? '管理员' : '用户' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small">
            {{ row.status === 'active' ? '正常' : '已禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交次数" width="90" prop="submitted_count" />
      <el-table-column label="成功次数" width="90" prop="completed_count" />
      <el-table-column label="失败次数" width="90" prop="failed_count" />
      <el-table-column label="最近提交" width="140">
        <template #default="{ row }">{{ row.last_submitted_at?.slice(0, 16) || '-' }}</template>
      </el-table-column>
      <el-table-column label="最近登录" width="140">
        <template #default="{ row }">{{ row.last_login_at?.slice(0, 16) || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openReset(row)">重置密码</el-button>
          <el-button
            size="small"
            :type="row.status === 'active' ? 'danger' : 'success'"
            plain
            @click="handleToggleStatus(row)"
          >
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create User Dialog -->
    <el-dialog v-model="createVisible" title="创建用户" width="400px">
      <el-form>
        <el-form-item label="用户名">
          <el-input v-model="createUsername" placeholder="输入用户名" />
        </el-form-item>
        <el-form-item label="初始密码">
          <el-input v-model="createPassword" type="password" placeholder="输入初始密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- Reset Password Dialog -->
    <el-dialog v-model="resetVisible" :title="`重置密码 - ${resetUsername}`" width="400px">
      <el-form-item label="新密码">
        <el-input v-model="resetPassword" type="password" placeholder="输入新密码" show-password />
      </el-form-item>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" @click="handleReset">确认重置</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
/* el-table uses its own styles */
</style>
