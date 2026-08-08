<script setup lang="ts">
defineOptions({ name: 'AdminUsers' })
import { ref, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import { formatCredits, creditsToYuan } from '@/types/adapter'
import { toBJMinute } from '@/utils/datetime'
import PageLayout from '@/components/PageLayout.vue'

interface UserItem {
  id: number
  username: string
  email: string | null
  nickname: string | null
  role: string
  status: string
  points: number
  submitted_count: number
  completed_count: number
  failed_count: number
  last_submitted_at: string | null
  last_login_at: string | null
  created_at: string
  total_spent?: number
  total_recharged?: number
}

const users = ref<UserItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
// 后端排序状态（积分/累计消耗/累计充值）
const sortField = ref<string>('')
const sortOrder = ref<'asc' | 'desc'>('desc')

// Create dialog
const createVisible = ref(false)
const createUsername = ref('')
const createPassword = ref('')
const createLoading = ref(false)

// Edit dialog
const editVisible = ref(false)
const editUser = ref<UserItem | null>(null)
const editStatus = ref('')
const editRole = ref('')
const editLoading = ref(false)

// Points dialog
const pointsVisible = ref(false)
const pointsUserId = ref(0)
const pointsUsername = ref('')
const pointsMode = ref<'recharge' | 'deduct'>('recharge')
const pointsAmount = ref<string>('')
const pointsNote = ref('')
const pointsLoading = ref(false)

// 解析后的积分数值（无效或为空时返回 0）
const pointsValue = computed(() => {
  const n = parseFloat(pointsAmount.value)
  return Number.isFinite(n) && n > 0 ? n : 0
})

// 参考金额：积分 × 0.035 元
const pointsYuan = computed(() => creditsToYuan(pointsValue.value))

async function loadUsers() {
  loading.value = true
  try {
    const params: any = {}
    if (searchQuery.value) params.search = searchQuery.value
    if (sortField.value) {
      params.sort = sortField.value
      params.order = sortOrder.value
    }
    const res = await adminApi.listUsers(params)
    users.value = res.data.data || []
  } catch {
    error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

// 表头排序：委托后端排序
function handleSortChange({ prop, order }: { prop: string; order: string | null }) {
  if (order) {
    sortField.value = prop
    sortOrder.value = order === 'ascending' ? 'asc' : 'desc'
  } else {
    // 取消排序，恢复默认
    sortField.value = ''
    sortOrder.value = 'desc'
  }
  loadUsers()
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
  editStatus.value = user.status
  editRole.value = user.role
  editVisible.value = true
}

async function handleEdit() {
  editLoading.value = true
  try {
    await adminApi.updateUser(editUser.value!.id, {
      status: editStatus.value,
      role: editRole.value,
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
  pointsMode.value = 'recharge'
  pointsAmount.value = ''
  pointsNote.value = ''
  pointsVisible.value = true
}

// 校验输入：正数，最多 1 位小数
function validatePointsInput(): number | null {
  const raw = pointsAmount.value.trim()
  if (!raw) {
    warning('请输入积分数量')
    return null
  }
  const n = parseFloat(raw)
  if (!Number.isFinite(n) || n <= 0) {
    warning('积分数量必须为正数')
    return null
  }
  // 最多 1 位小数
  if (!/^\d+(\.\d)?$/.test(raw)) {
    warning('积分数量最多保留 1 位小数')
    return null
  }
  return n
}

async function handleAdjustPoints() {
  const amount = validatePointsInput()
  if (amount === null) return

  const signedAmount = pointsMode.value === 'deduct' ? -amount : amount
  const actionLabel = pointsMode.value === 'deduct' ? '扣减' : '充值'

  // 扣减二次确认
  if (pointsMode.value === 'deduct') {
    try {
      await confirmDanger({
        title: '确认扣减积分',
        message: `确定从用户 "${pointsUsername.value}" 扣减 ${amount} 积分（约 ¥${pointsYuan.value.toFixed(2)}）吗？`,
        confirmText: '确认扣减',
      })
    } catch {
      return // 取消
    }
  }

  pointsLoading.value = true
  try {
    await adminApi.adjustPoints(pointsUserId.value, signedAmount, pointsNote.value)
    success(`${actionLabel}成功`)
    pointsVisible.value = false
    await loadUsers()
  } catch (e: any) {
    error(e.response?.data?.error || '操作失败')
  } finally {
    pointsLoading.value = false
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <PageLayout>
    <template #header><h2>用户管理</h2></template>
    <template #extra>
      <el-button type="primary" @click="createVisible = true">创建用户</el-button>
    </template>

    <!-- Search -->
    <div style="margin-bottom:16px">
      <el-input
        v-model="searchQuery"
        placeholder="搜索用户名或邮箱..."
        clearable
        style="width:240px"
        @change="loadUsers"
        @clear="loadUsers"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>

    <el-table :data="users" v-loading="loading" stripe @sort-change="handleSortChange">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column label="用户名">
        <template #default="{ row }">
          {{ row.nickname || row.username }}
          <span v-if="row.nickname" class="username-hint">({{ row.username }})</span>
        </template>
      </el-table-column>
      <el-table-column prop="email" label="邮箱" width="200">
        <template #default="{ row }">
          <span v-if="row.email">{{ row.email }}</span>
          <span v-else class="username-hint">未绑定</span>
        </template>
      </el-table-column>
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
      <el-table-column label="积分" width="170" prop="points" sortable="custom">
        <template #default="{ row }">
          <span :style="{ color: row.points <= 0 ? 'var(--el-color-danger)' : 'var(--el-color-primary)', fontWeight: 600 }">
            {{ formatCredits(row.points, { creditDigits: 0, yuanDigits: 2 }) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="累计消耗" width="170" prop="total_spent" sortable="custom">
        <template #default="{ row }">
          <span style="color:var(--el-color-danger)">-{{ formatCredits(Math.abs(row.total_spent || 0), { creditDigits: 0, yuanDigits: 2 }) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="累计充值" width="170" prop="total_recharged" sortable="custom">
        <template #default="{ row }">
          <span style="color:var(--el-color-success)">+{{ formatCredits(row.total_recharged || 0, { creditDigits: 0, yuanDigits: 2 }) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="提交" width="70" prop="submitted_count" />
      <el-table-column label="成功" width="70" prop="completed_count" />
      <el-table-column label="失败" width="70" prop="failed_count" />
      <el-table-column label="最近登录" width="168" prop="last_login_at" sortable="custom">
        <template #default="{ row }">{{ toBJMinute(row.last_login_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <div style="display:flex;gap:4px;flex-wrap:nowrap;align-items:center">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openPoints(row)">积分</el-button>
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

    <!-- Edit User Dialog -->
    <el-dialog v-model="editVisible" :title="`编辑用户 - ${editUser?.username}`" width="500px">
      <el-form>
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
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="handleEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- Points Adjustment Dialog -->
    <el-dialog v-model="pointsVisible" :title="`调整积分 - ${pointsUsername}`" width="420px">
      <el-form label-width="72px">
        <el-form-item label="操作类型">
          <el-radio-group v-model="pointsMode">
            <el-radio-button value="recharge">充值</el-radio-button>
            <el-radio-button value="deduct">扣减</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="积分数量">
          <div style="display:flex;align-items:center;gap:12px;width:100%">
            <el-input
              v-model="pointsAmount"
              placeholder="输入积分数量"
              type="number"
              :step="1"
              min="0"
              style="flex:1"
            />
            <span class="points-yuan-hint">
              ≈ ¥{{ pointsYuan.toFixed(2) }}
            </span>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="pointsNote" placeholder="可选：调整理由" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pointsVisible = false">取消</el-button>
        <el-button
          :type="pointsMode === 'deduct' ? 'danger' : 'success'"
          :loading="pointsLoading"
          :disabled="pointsValue <= 0"
          @click="handleAdjustPoints"
        >
          {{ pointsMode === 'deduct' ? '确认扣减' : '确认充值' }}
        </el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.username-hint {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
  margin-left: 4px;
}

.points-yuan-hint {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  min-width: 72px;
}
</style>
