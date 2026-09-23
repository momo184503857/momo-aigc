<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ChevronDown, ChevronRight, X } from '@lucide/vue'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UiEmptyState, UiPagination } from '@/components/ui'

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

// reka SelectItem 不接受空字符串 value，用哨兵值表示「全部」（替代原 clearable）
const ALL_STATUS = '__all__'

// 展开行（替代旧表格的 expand 列）
const expandedIds = ref<Set<number>>(new Set())
function toggleExpand(id: number) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

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
        <Select
          :model-value="filterStatus || ALL_STATUS"
          @update:model-value="(v) => (filterStatus = String(v) === ALL_STATUS ? '' : String(v))"
        >
          <SelectTrigger class="h-7 w-30 text-[0.8rem]">
            <SelectValue placeholder="状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_STATUS">全部</SelectItem>
            <SelectItem v-for="(label, key) in statusMap" :key="key" :value="String(key)">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <!-- 清空后由 watch 回到第 1 页并重查，避免与手动 loadTasks 重复请求 -->
        <div class="relative w-30">
          <Input v-model="filterUserId" placeholder="用户ID" class="h-7 pr-6 text-[0.8rem]" />
          <button
            v-if="filterUserId"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer"
            title="清除"
            @click="filterUserId = ''"
          >
            <X class="size-3.5" />
          </button>
        </div>
        <Button size="sm" variant="outline" @click="loadTasks">刷新</Button>
      </div>
    </template>

    <div class="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-11"></TableHead>
            <TableHead class="w-[60px]">ID</TableHead>
            <TableHead class="w-[100px]">用户</TableHead>
            <TableHead class="w-[170px]">任务ID</TableHead>
            <TableHead class="w-[180px]">渠道任务ID</TableHead>
            <TableHead class="w-[150px]">模型</TableHead>
            <TableHead>提示词</TableHead>
            <TableHead class="w-[100px]">状态</TableHead>
            <TableHead class="w-[140px]">提交时间</TableHead>
            <TableHead class="w-[80px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell :colspan="10"><Skeleton class="h-8 w-full" /></TableCell>
            </TableRow>
          </template>
          <template v-else>
            <template v-for="row in tasks" :key="row.id">
              <TableRow>
                <TableCell>
                  <Button variant="ghost" size="icon-xs" @click="toggleExpand(row.id)">
                    <ChevronDown v-if="expandedIds.has(row.id)" />
                    <ChevronRight v-else />
                  </Button>
                </TableCell>
                <TableCell>{{ row.id }}</TableCell>
                <TableCell>{{ row.username }}</TableCell>
                <TableCell class="max-w-40 truncate" :title="row.task_no || '-'">
                  <span class="task-no">{{ row.task_no || '-' }}</span>
                </TableCell>
                <TableCell class="max-w-44 truncate" :title="row.provider_task_id || row.toapis_task_id || '-'">
                  <span class="task-no">{{ row.provider_task_id || row.toapis_task_id || '-' }}</span>
                </TableCell>
                <TableCell>{{ modelCatalog.displayNameFor(row.model) }}</TableCell>
                <TableCell class="max-w-52 truncate" :title="row.prompt">{{ row.prompt }}</TableCell>
                <TableCell>
                  <Badge
                    :variant="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'destructive' : 'secondary'"
                  >
                    {{ statusMap[row.status] || row.status }}
                  </Badge>
                </TableCell>
                <TableCell>{{ toBJMinute(row.created_at) }}</TableCell>
                <TableCell class="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive hover:text-destructive"
                    @click="handleDelete(row)"
                  >删除</Button>
                </TableCell>
              </TableRow>
              <TableRow v-if="expandedIds.has(row.id)">
                <TableCell :colspan="10" class="bg-muted/40 p-3">
                  <div v-if="row.route_attempts?.length" class="overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead class="w-[52px]">#</TableHead>
                          <TableHead>渠道</TableHead>
                          <TableHead>渠道模型</TableHead>
                          <TableHead>Key</TableHead>
                          <TableHead class="w-[100px]">成本</TableHead>
                          <TableHead class="w-[100px]">结果</TableHead>
                          <TableHead>错误</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow v-for="attempt in row.route_attempts" :key="attempt.id">
                          <TableCell>{{ attempt.attempt_no }}</TableCell>
                          <TableCell>{{ attempt.provider_name }}</TableCell>
                          <TableCell>{{ attempt.channel_model_name }}</TableCell>
                          <TableCell>{{ attempt.key_name }}</TableCell>
                          <TableCell>¥{{ attempt.cost_price }}</TableCell>
                          <TableCell>
                            <Badge
                              :variant="attempt.status === 'succeeded' ? 'success' : attempt.status === 'failed' ? 'destructive' : 'secondary'"
                            >
                              {{ attempt.status }}
                            </Badge>
                          </TableCell>
                          <TableCell class="max-w-56 truncate" :title="attempt.error_message || ''">
                            {{ attempt.error_message }}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <UiEmptyState v-else title="该任务没有路由记录" />
                </TableCell>
              </TableRow>
            </template>
            <TableEmpty v-if="!tasks.length" :colspan="10">
              <UiEmptyState title="暂无数据" />
            </TableEmpty>
          </template>
        </TableBody>
      </Table>
    </div>

    <UiPagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :show-size-selector="false"
      class="mt-4"
      @current-change="loadTasks"
    />
  </PageLayout>
</template>

<style scoped>
.filters { display: flex; gap: var(--momo-space-2); align-items: center; }
.task-no { font-family: var(--momo-font-mono, monospace); font-size: var(--momo-font-size-xs); }
</style>
