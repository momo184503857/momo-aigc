<script setup lang="ts">
defineOptions({ name: 'AdminUsers' })
import { computed, onMounted, ref } from 'vue'
import {
  Ban,
  CircleCheck,
  Coins,
  Ellipsis,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  UserRoundPlus,
} from '@lucide/vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import { formatCredits } from '@/types/adapter'
import { toBJMinute } from '@/utils/datetime'
import { BasicPage } from '@/components/global-layout'
import { DataTableColumnHeader, DataTableLoading, DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

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
  admin_note: string | null
  total_spent?: number
  total_recharged?: number
}

const users = ref<UserItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const statusFilter = ref('active')
// 分页状态
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
// 后端排序状态（积分/累计消耗/累计充值/最近登录）；初始不排序，沿用后端默认顺序
const sortField = ref<string>('')
const sortOrder = ref<'asc' | 'desc'>('asc')

// reka SelectItem 不接受空字符串 value，用哨兵值表示「全部」（替代原 clearable）
const ALL_STATUS = '__all__'
/** 页面默认状态筛选：进入页面只看正常用户，重置也回到这里 */
const DEFAULT_STATUS = 'active'

/** 可排序表头交给 DataTableColumnHeader 的显式方向，替代原来「点表头循环」的隐式状态机 */
function applySort(key: string, order: 'asc' | 'desc' | null) {
  if (!order) {
    sortField.value = ''
    sortOrder.value = 'asc'
  } else {
    sortField.value = key
    sortOrder.value = order
  }
  reloadFromFirstPage()
}

// Create dialog
const createVisible = ref(false)
const createUsername = ref('')
const createPassword = ref('')
const showCreatePassword = ref(false)
const createLoading = ref(false)

// Edit dialog
const editVisible = ref(false)
const editUser = ref<UserItem | null>(null)
const editStatus = ref('')
const editRole = ref('')
const editNote = ref('')
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

async function loadUsers() {
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      pageSize: pageSize.value,
    }
    if (searchQuery.value) params.search = searchQuery.value
    if (statusFilter.value) params.status = statusFilter.value
    if (sortField.value) {
      params.sort = sortField.value
      params.order = sortOrder.value
    }
    const res = await adminApi.listUsers(params)
    users.value = res.data.data.list || []
    total.value = res.data.data.total || 0
    // 若当前页已超出总页数（如搜索后数据变少），回退到最后一页
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value))
    if (page.value > maxPage) {
      page.value = maxPage
      return loadUsers()
    }
  } catch {
    error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

// 筛选条件变化时回到第 1 页再查询
function reloadFromFirstPage() {
  page.value = 1
  loadUsers()
}

// 还原 el-input 的 @change 语义：记住上次已提交的搜索词，失焦时仅在值有变化才重查
const committedSearch = ref('')

function commitSearch() {
  if (searchQuery.value === committedSearch.value) return
  committedSearch.value = searchQuery.value
  reloadFromFirstPage()
}

const isFiltered = computed(
  () => searchQuery.value.trim() !== '' || statusFilter.value !== DEFAULT_STATUS || !!sortField.value,
)

function resetFilters() {
  searchQuery.value = ''
  committedSearch.value = ''
  statusFilter.value = DEFAULT_STATUS
  sortField.value = ''
  sortOrder.value = 'asc'
  reloadFromFirstPage()
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
  editNote.value = user.admin_note || ''
  editVisible.value = true
}

async function handleEdit() {
  editLoading.value = true
  try {
    await adminApi.updateUser(editUser.value!.id, {
      status: editStatus.value,
      role: editRole.value,
      note: editNote.value,
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

// 校验输入：正数，最多 2 位小数
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
  // 最多 2 位小数
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    warning('积分数量最多保留 2 位小数')
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
        message: `确定从用户 "${pointsUsername.value}" 扣减 ${amount} 积分吗？`,
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

/** 状态Chip：沿用 reference 的浅色调 outline Badge，而非整块红/绿实底 */
const statusChip: Record<string, string> = {
  active: 'border-teal-200 bg-teal-100/30 text-teal-900',
  disabled: 'border-neutral-300 bg-neutral-300/40',
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <BasicPage title="用户管理" description="账户、积分与产出汇总，全部走后端分页与排序。" sticky>
    <template #actions>
      <Button class="h-9 px-4" variant="outline" :disabled="loading" @click="loadUsers">
        <RefreshCw :class="loading ? 'animate-spin' : ''" />
        刷新
      </Button>
      <Button class="h-9 px-4" @click="createVisible = true">
        <UserRoundPlus />
        创建用户
      </Button>
    </template>

    <div class="space-y-4">
      <DataTableToolbar :filtered="isFiltered" @reset="resetFilters">
        <Input
          v-model="searchQuery"
          placeholder="搜索用户名 / 邮箱 / 备注..."
          class="h-8 w-[150px] lg:w-[250px]"
          @keyup.enter="commitSearch"
          @blur="commitSearch"
        />
        <Select
          :model-value="statusFilter || ALL_STATUS"
          @update:model-value="(v) => { statusFilter = String(v) === ALL_STATUS ? '' : String(v); reloadFromFirstPage() }"
        >
          <SelectTrigger class="h-8 w-[7.5rem]">
            <SelectValue placeholder="全部" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_STATUS">全部</SelectItem>
            <SelectItem value="active">正常</SelectItem>
            <SelectItem value="disabled">已禁用</SelectItem>
          </SelectContent>
        </Select>
      </DataTableToolbar>

      <div class="rounded-md border">
        <Table :aria-busy="loading || undefined" sticky-last-column>
          <TableHeader>
            <TableRow>
              <TableHead class="min-w-[170px]">用户</TableHead>
              <TableHead class="min-w-[180px]">邮箱</TableHead>
              <TableHead class="w-[92px]">状态</TableHead>
              <TableHead class="min-w-[150px]">备注</TableHead>
              <TableHead class="w-[120px]">
                <DataTableColumnHeader
                  label="积分"
                  sort-key="points"
                  :active-key="sortField"
                  :active-order="sortOrder"
                  align="end"
                  class="w-full justify-end"
                  @sort="applySort('points', $event)"
                />
              </TableHead>
              <TableHead class="w-[120px]">
                <DataTableColumnHeader
                  label="累计消耗"
                  sort-key="total_spent"
                  :active-key="sortField"
                  :active-order="sortOrder"
                  align="end"
                  class="w-full justify-end"
                  @sort="applySort('total_spent', $event)"
                />
              </TableHead>
              <TableHead class="w-[120px]">
                <DataTableColumnHeader
                  label="累计充值"
                  sort-key="total_recharged"
                  :active-key="sortField"
                  :active-order="sortOrder"
                  align="end"
                  class="w-full justify-end"
                  @sort="applySort('total_recharged', $event)"
                />
              </TableHead>
              <TableHead class="w-[120px]" title="提交 / 成功 / 失败">产出</TableHead>
              <TableHead class="w-[150px]">
                <DataTableColumnHeader
                  label="最近登录"
                  sort-key="last_login_at"
                  :active-key="sortField"
                  :active-order="sortOrder"
                  class="w-full"
                  @sort="applySort('last_login_at', $event)"
                />
              </TableHead>
              <TableHead class="w-12" />
            </TableRow>
          </TableHeader>

          <TableBody v-if="!loading">
            <template v-if="users.length">
              <TableRow v-for="row in users" :key="row.id">
                <TableCell class="max-w-[220px]">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate font-medium">{{ row.nickname || row.username }}</span>
                    <Badge v-if="row.role === 'admin'" variant="outline" class="shrink-0">管理员</Badge>
                    <span class="text-muted-foreground shrink-0 text-xs tabular-nums">#{{ row.id }}</span>
                  </div>
                  <div v-if="row.nickname" class="text-muted-foreground truncate text-xs">
                    {{ row.username }}
                  </div>
                </TableCell>
                <TableCell class="max-w-[220px]">
                  <span v-if="row.email" class="text-muted-foreground truncate">{{ row.email }}</span>
                  <span v-else class="text-muted-foreground/60 text-xs">未绑定</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" :class="statusChip[row.status] || ''">
                    {{ row.status === 'active' ? '正常' : '已禁用' }}
                  </Badge>
                </TableCell>
                <TableCell class="max-w-[200px]">
                  <span v-if="row.admin_note" class="block truncate text-sm" :title="row.admin_note">{{ row.admin_note }}</span>
                  <span v-else class="text-muted-foreground/60">—</span>
                </TableCell>
                <TableCell class="text-right font-medium tabular-nums" :class="row.points <= 0 ? 'text-destructive' : ''">
                  {{ formatCredits(row.points, { creditDigits: 2 }) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  <span class="text-destructive">-{{ formatCredits(Math.abs(row.total_spent || 0), { creditDigits: 2 }) }}</span>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  <span class="text-success">+{{ formatCredits(row.total_recharged || 0, { creditDigits: 2 }) }}</span>
                </TableCell>
                <TableCell class="text-sm tabular-nums">
                  <span>{{ row.submitted_count }}</span>
                  <span class="text-muted-foreground/60"> / </span>
                  <span class="text-success">{{ row.completed_count }}</span>
                  <span class="text-muted-foreground/60"> / </span>
                  <span :class="row.failed_count > 0 ? 'text-destructive' : 'text-muted-foreground/60'">{{ row.failed_count }}</span>
                </TableCell>
                <TableCell class="text-muted-foreground text-sm tabular-nums">{{ toBJMinute(row.last_login_at) }}</TableCell>
                <TableCell class="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" class="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
                        <Ellipsis class="size-4" />
                        <span class="sr-only">打开操作菜单</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-[160px]">
                      <DropdownMenuLabel class="font-normal">
                        {{ row.nickname || row.username }}
                      </DropdownMenuLabel>
                      <DropdownMenuItem @click="openPoints(row)">
                        <Coins class="text-muted-foreground/70 mr-2 size-4" />
                        调整积分
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="openEdit(row)">
                        <Pencil class="text-muted-foreground/70 mr-2 size-4" />
                        编辑资料
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        v-if="row.status === 'active'"
                        class="text-destructive focus:text-destructive"
                        @click="handleToggleStatus(row)"
                      >
                        <Ban class="mr-2 size-4" />
                        禁用账号
                      </DropdownMenuItem>
                      <DropdownMenuItem v-else @click="handleToggleStatus(row)">
                        <CircleCheck class="text-muted-foreground/70 mr-2 size-4" />
                        启用账号
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </template>

            <TableRow v-else>
              <TableCell colspan="10" class="h-24 text-center">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>未找到用户</EmptyTitle>
                    <EmptyDescription>
                      换个关键词，或把状态筛选切到「全部」再试一次。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <DataTableLoading v-if="loading" />
      </div>

      <DataTablePagination
        v-if="!loading && total > 0"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        @size-change="reloadFromFirstPage"
        @current-change="loadUsers"
      />
    </div>

    <!-- Create User Dialog -->
    <Dialog :open="createVisible" @update:open="(v: boolean) => (createVisible = v)">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>创建用户</DialogTitle>
          <DialogDescription>新建一个可登录的账号，初始密码由管理员设定。</DialogDescription>
        </DialogHeader>
        <form class="space-y-8" @submit.prevent="handleCreate">
          <div class="grid gap-2">
            <Label for="create-username">用户名</Label>
            <Input id="create-username" v-model="createUsername" placeholder="输入用户名" />
          </div>
          <div class="grid gap-2">
            <Label for="create-password">初始密码</Label>
            <div class="relative">
              <Input
                id="create-password"
                v-model="createPassword"
                :type="showCreatePassword ? 'text' : 'password'"
                placeholder="输入初始密码"
                class="pr-9"
              />
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                :title="showCreatePassword ? '隐藏密码' : '显示密码'"
                @click="showCreatePassword = !showCreatePassword"
              >
                <EyeOff v-if="showCreatePassword" class="size-4" />
                <Eye v-else class="size-4" />
              </button>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" @click="createVisible = false">取消</Button>
          <Button :disabled="createLoading" @click="handleCreate">
            <LoaderCircle v-if="createLoading" class="animate-spin" />
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit User Dialog -->
    <Dialog :open="editVisible" @update:open="(v: boolean) => (editVisible = v)">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ `编辑用户 - ${editUser?.username}` }}</DialogTitle>
          <DialogDescription>状态与角色即时生效，备注仅管理员可见。</DialogDescription>
        </DialogHeader>
        <div class="max-h-[500px] space-y-8 overflow-y-auto">
          <div class="grid gap-2">
            <Label>状态</Label>
            <RadioGroup v-model="editStatus" class="flex gap-4">
              <div class="flex items-center gap-1.5">
                <RadioGroupItem id="edit-status-active" value="active" />
                <Label for="edit-status-active" class="font-normal">正常</Label>
              </div>
              <div class="flex items-center gap-1.5">
                <RadioGroupItem id="edit-status-disabled" value="disabled" />
                <Label for="edit-status-disabled" class="font-normal">禁用</Label>
              </div>
            </RadioGroup>
          </div>
          <div class="grid gap-2">
            <Label>角色</Label>
            <RadioGroup v-model="editRole" class="flex gap-4">
              <div class="flex items-center gap-1.5">
                <RadioGroupItem id="edit-role-user" value="user" />
                <Label for="edit-role-user" class="font-normal">用户</Label>
              </div>
              <div class="flex items-center gap-1.5">
                <RadioGroupItem id="edit-role-admin" value="admin" />
                <Label for="edit-role-admin" class="font-normal">管理员</Label>
              </div>
            </RadioGroup>
          </div>
          <div class="grid gap-2">
            <Label for="edit-note">备注</Label>
            <Textarea
              id="edit-note"
              v-model="editNote"
              :rows="3"
              maxlength="500"
              placeholder="仅管理员可见，可记录用户情况（如充值意向、特殊说明等）"
            />
            <p class="text-muted-foreground text-right text-xs">{{ editNote.length }}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editVisible = false">取消</Button>
          <Button :disabled="editLoading" @click="handleEdit">
            <LoaderCircle v-if="editLoading" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Points Adjustment Dialog -->
    <Dialog :open="pointsVisible" @update:open="(v: boolean) => (pointsVisible = v)">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ `调整积分 - ${pointsUsername}` }}</DialogTitle>
          <DialogDescription>扣减需要二次确认，备注会写入积分流水。</DialogDescription>
        </DialogHeader>
        <div class="space-y-8">
          <div class="grid gap-2">
            <Label>操作类型</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              :model-value="pointsMode"
              @update:model-value="(v) => { if (v) pointsMode = String(v) as 'recharge' | 'deduct' }"
            >
              <ToggleGroupItem value="recharge">充值</ToggleGroupItem>
              <ToggleGroupItem value="deduct">扣减</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div class="grid gap-2">
            <Label for="points-amount">积分数量</Label>
            <Input
              id="points-amount"
              v-model="pointsAmount"
              placeholder="输入积分数量"
              type="number"
              :step="1"
              min="0"
            />
          </div>
          <div class="grid gap-2">
            <Label for="points-note">备注</Label>
            <Input id="points-note" v-model="pointsNote" placeholder="可选：调整理由" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="pointsVisible = false">取消</Button>
          <Button
            :variant="pointsMode === 'deduct' ? 'destructive' : 'default'"
            :disabled="pointsLoading || pointsValue <= 0"
            @click="handleAdjustPoints"
          >
            <LoaderCircle v-if="pointsLoading" class="animate-spin" />
            {{ pointsMode === 'deduct' ? '确认扣减' : '确认充值' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </BasicPage>
</template>
