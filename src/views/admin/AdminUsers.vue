<script setup lang="ts">
defineOptions({ name: 'AdminUsers' })
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error, confirmDanger } = useUiFeedback()
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
  completed_count: number
  failed_count: number
  last_submitted_at: string | null
  last_login_at: string | null
  created_at: string
}

interface TagItem {
  id: number
  name: string
  color: string
}

const users = ref<UserItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const filterTag = ref('')
const tags = ref<TagItem[]>([])

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

// Edit dialog
const editVisible = ref(false)
const editUser = ref<UserItem | null>(null)
const editUsername = ref('')
const editPassword = ref('')
const editStatus = ref('')
const editRole = ref('')
const editTags = ref<string[]>([])
const editLoading = ref(false)

// Points dialog
const pointsVisible = ref(false)
const pointsUserId = ref(0)
const pointsUsername = ref('')
const pointsAmount = ref(0)
const pointsNote = ref('')
const pointsLoading = ref(false)

// Tag manage dialog
const tagManageVisible = ref(false)
const newTagName = ref('')
const newTagColor = ref('#409EFF')
const tagLoading = ref(false)

async function loadUsers() {
  loading.value = true
  try {
    const params: any = {}
    if (searchQuery.value) params.search = searchQuery.value
    if (filterTag.value) params.tag = filterTag.value
    const res = await adminApi.listUsers(params)
    users.value = res.data.data || []
  } catch {
    error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

async function loadTags() {
  try {
    const res = await adminApi.listTags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}

function parseTags(tagsStr: string): string[] {
  try { return JSON.parse(tagsStr) } catch { return [] }
}

async function handleCreate() {
  if (!createUsername.value || !createPassword.value) {
    warning('请输入用户名和密码')
    return
  }
  createLoading.value = true
  try {
    await adminApi.createUser(createUsername.value, createPassword.value)
    success('创建成功')
    createVisible.value = false
    createUsername.value = ''
    createPassword.value = ''
    await loadUsers()
  } catch (e: any) {
    error(e.response?.data?.error || '创建失败')
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
    warning('请输入新密码')
    return
  }
  try {
    await adminApi.resetPassword(resetUserId.value, resetPassword.value)
    success('密码已重置')
    resetVisible.value = false
  } catch (e: any) {
    error(e.response?.data?.error || '重置失败')
  }
}

async function handleToggleStatus(user: UserItem) {
  const newStatus = user.status === 'active' ? 'disabled' : 'active'
  const action = newStatus === 'disabled' ? '禁用' : '启用'
  try {
    await confirmDanger({ title: `确认${action}`, message: `确定${action}用户 "${user.username}" 吗？` })
    await adminApi.updateUserStatus(user.id, newStatus)
    success(`已${action}`)
    await loadUsers()
  } catch { /* cancelled */ }
}

function openEdit(user: UserItem) {
  editUser.value = user
  editUsername.value = user.username
  editPassword.value = ''
  editStatus.value = user.status
  editRole.value = user.role
  editTags.value = parseTags(user.tags)
  editVisible.value = true
}

async function handleEdit() {
  editLoading.value = true
  try {
    await adminApi.updateUser(editUser.value!.id, {
      username: editUsername.value,
      password: editPassword.value || undefined,
      status: editStatus.value,
      role: editRole.value,
      tags: editTags.value,
    })
    success('保存成功')
    editVisible.value = false
    await loadUsers()
  } catch (e: any) {
    error(e.response?.data?.error || '保存失败')
  } finally {
    editLoading.value = false
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

async function handleAddTag() {
  if (!newTagName.value) {
    warning('请输入标签名')
    return
  }
  tagLoading.value = true
  try {
    await adminApi.createTag(newTagName.value, newTagColor.value)
    success('标签创建成功')
    newTagName.value = ''
    await loadTags()
  } catch (e: any) {
    error(e.response?.data?.error || '创建失败')
  } finally {
    tagLoading.value = false
  }
}

async function handleDeleteTag(tag: TagItem) {
  try {
    await confirmDanger({ title: '删除标签', message: `确定删除标签 "${tag.name}" 吗？` })
    await adminApi.deleteTag(tag.id)
    success('已删除')
    await loadTags()
  } catch { /* cancelled */ }
}

onMounted(() => {
  loadUsers()
  loadTags()
})
</script>

<template>
  <PageLayout>
    <template #header><h2>用户管理</h2></template>
    <template #extra>
      <div style="display:flex;gap:8px">
        <el-button type="primary" @click="createVisible = true">创建用户</el-button>
        <el-button @click="tagManageVisible = true">管理标签</el-button>
      </div>
    </template>

    <!-- Search & Filter -->
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <el-input
        v-model="searchQuery"
        placeholder="搜索用户名..."
        clearable
        style="width:240px"
        @change="loadUsers"
        @clear="loadUsers"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select
        v-model="filterTag"
        placeholder="按标签筛选"
        clearable
        style="width:200px"
        @change="loadUsers"
      >
        <el-option
          v-for="t in tags"
          :key="t.id"
          :label="t.name"
          :value="t.name"
        />
      </el-select>
    </div>

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
      <el-table-column label="积分" width="100">
        <template #default="{ row }">
          <span :style="{ color: row.points <= 0 ? 'var(--el-color-danger)' : 'var(--el-color-primary)', fontWeight: 600 }">
            {{ row.points }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="标签" width="180">
        <template #default="{ row }">
          <el-tag
            v-for="t in parseTags(row.tags)"
            :key="t"
            size="small"
            style="margin-right:4px"
          >{{ t }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交" width="70" prop="submitted_count" />
      <el-table-column label="成功" width="70" prop="completed_count" />
      <el-table-column label="失败" width="70" prop="failed_count" />
      <el-table-column label="最近登录" width="140">
        <template #default="{ row }">{{ row.last_login_at?.slice(0, 16) || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <div style="display:flex;gap:4px;flex-wrap:nowrap;align-items:center">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openPoints(row)">积分</el-button>
            <el-button size="small" @click="openReset(row)">密码</el-button>
            <el-button
              size="small"
              :type="row.status === 'active' ? 'danger' : 'success'"
              plain
              @click="handleToggleStatus(row)"
            >
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
          </div>
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

    <!-- Edit User Dialog -->
    <el-dialog v-model="editVisible" :title="`编辑用户 - ${editUser?.username}`" width="500px">
      <el-form>
        <el-form-item label="用户名">
          <el-input v-model="editUsername" />
        </el-form-item>
        <el-form-item label="新密码（留空不修改）">
          <el-input v-model="editPassword" type="password" placeholder="留空则不修改" show-password />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="editStatus">
            <el-radio value="active">正常</el-radio>
            <el-radio value="disabled">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="editRole">
            <el-radio value="user">用户</el-radio>
            <el-radio value="admin">管理员</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="editTags"
            multiple
            filterable
            allow-create
            placeholder="选择或创建标签"
            style="width:100%"
          >
            <el-option
              v-for="t in tags"
              :key="t.id"
              :label="t.name"
              :value="t.name"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="handleEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- Points Adjustment Dialog -->
    <el-dialog v-model="pointsVisible" :title="`调整积分 - ${pointsUsername}`" width="400px">
      <el-form>
        <el-form-item label="金额">
          <UiNumberInput v-model="pointsAmount" :precision="3" :step="1" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="pointsNote" placeholder="可选：调整理由" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <el-button @click="pointsVisible = false">取消</el-button>
          <el-button
            type="danger"
            :disabled="pointsAmount >= 0"
            :loading="pointsLoading"
            @click="pointsAmount = Math.abs(pointsAmount) * -1; handleAdjustPoints()"
          >
            扣减
          </el-button>
          <el-button
            type="success"
            :disabled="pointsAmount <= 0"
            :loading="pointsLoading"
            @click="handleAdjustPoints"
          >
            充值
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Tag Management Dialog -->
    <el-dialog v-model="tagManageVisible" title="标签管理" width="500px">
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <el-input v-model="newTagName" placeholder="标签名" style="width:160px" />
        <el-color-picker v-model="newTagColor" />
        <el-button type="primary" :loading="tagLoading" @click="handleAddTag">添加</el-button>
      </div>
      <el-table :data="tags" size="small" max-height="300">
        <el-table-column label="颜色" width="60">
          <template #default="{ row }">
            <div :style="{ width:'20px',height:'20px',borderRadius:'4px',background:row.color }" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button size="small" type="danger" plain @click="handleDeleteTag(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </PageLayout>
</template>
