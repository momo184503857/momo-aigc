<script setup lang="ts">
/**
 * AdminPromptModules - 提示词工坊 · 模块管理页面。
 *
 * 模块类型：requirement（要求）/ element（元素）/ forbidden（禁止出现）。
 * 「要求」「禁止出现」为系统内置（is_system=1），不可改名、不可删除；
 * 管理员在此基础上自由增删「元素」模块（风格/场景/光影/构图/画质等）。
 */
defineOptions({ name: 'AdminPromptModules' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import PageLayout from '@/components/PageLayout.vue'
import { adminPromptModulesApi } from '@/services/promptCardsApi'
import { Plus, Pencil, Trash2, RefreshCw, LoaderCircle } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UiEmptyState, UiNumberInput } from '@/components/ui'

const { success, warning, error, confirmDanger } = useUiFeedback()

interface ModuleRow {
  id: number
  name: string
  type: 'requirement' | 'element' | 'forbidden'
  sort_order: number
  is_system: boolean
}

const modules = ref<ModuleRow[]>([])
const loading = ref(false)

const typeTagMap: Record<string, { label: string; type: 'warning' | 'default' | 'destructive' | 'secondary' }> = {
  requirement: { label: '要求', type: 'warning' },
  element: { label: '元素', type: 'default' },
  forbidden: { label: '禁止出现', type: 'destructive' },
}

// 编辑/新增弹窗
const editVisible = ref(false)
const editingId = ref<number | null>(null)
const form = ref({ name: '', sort_order: 0 })
const submitting = ref(false)

/**
 * 视图分组：按 is_system 分成两段，让「哪些行不能动」由分组本身说明，
 * 而不是靠每行一个灰色禁用按钮 + 悬浮 title 去猜。
 */
const groupedModules = computed<Array<{ key: 'system' | 'custom'; title: string; note: string; items: ModuleRow[] }>>(() => {
  const system = modules.value.filter((m) => m.is_system)
  const custom = modules.value.filter((m) => !m.is_system)
  const groups: Array<{ key: 'system' | 'custom'; title: string; note: string; items: ModuleRow[] }> = []
  if (system.length) {
    groups.push({ key: 'system', title: '系统内置', note: '拼接时固定首尾，不可改名 / 删除', items: system })
  }
  if (custom.length) {
    groups.push({ key: 'custom', title: '元素模块', note: '可自由增删，顺序由「排序」决定', items: custom })
  }
  return groups
})

const systemCount = computed(() => modules.value.filter((m) => m.is_system).length)

async function loadModules() {
  loading.value = true
  try {
    const res = await adminPromptModulesApi.list()
    modules.value = res.data.data || []
  } catch (e) {
    error(e, '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = { name: '', sort_order: 0 }
  editVisible.value = true
}

function openEdit(row: ModuleRow) {
  editingId.value = row.id
  form.value = { name: row.name, sort_order: row.sort_order }
  editVisible.value = true
}

async function handleSubmit() {
  const name = form.value.name.trim()
  if (!name) {
    warning('请输入模块名')
    return
  }
  submitting.value = true
  try {
    if (editingId.value) {
      await adminPromptModulesApi.update(editingId.value, {
        name,
        sort_order: Number(form.value.sort_order) || 0,
      })
      success('已更新')
    } else {
      await adminPromptModulesApi.create({
        name,
        sort_order: Number(form.value.sort_order) || 0,
      })
      success('已新增模块')
    }
    editVisible.value = false
    loadModules()
  } catch (e) {
    error(e, '保存失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: ModuleRow) {
  try {
    await confirmDanger({ message: `确定删除模块「${row.name}」吗？引用该模块的卡片会保留（模块名回退为「已删除模块」）。` })
  } catch {
    return
  }
  try {
    await adminPromptModulesApi.delete(row.id)
    success('已删除')
    loadModules()
  } catch (e) {
    error(e, '删除失败')
  }
}

onMounted(loadModules)
</script>

<template>
  <PageLayout
    title="提示词模块管理"
    subtitle="「要求」「禁止出现」为系统内置模块；管理员可自由增删「元素」模块（风格 / 场景 / 光影 / 构图 / 画质等）。"
    content-padding="0"
  >
    <template #extra>
      <Button @click="openCreate"><Plus />新增模块</Button>
    </template>

    <template #filters>
      <Button variant="ghost" size="sm" class="gap-1.5" @click="loadModules">
        <RefreshCw class="size-3.5" />刷新
      </Button>
      <span v-if="!loading && modules.length" class="text-muted-foreground ml-auto text-xs tabular-nums">
        共 {{ modules.length }} 个模块 · 系统 {{ systemCount }} / 自定义 {{ modules.length - systemCount }}
      </span>
    </template>

    <div class="table-host h-full min-h-0">
      <Table sticky-header sticky-last-column max-height="100%">
        <TableHeader>
          <TableRow>
            <TableHead>模块名</TableHead>
            <TableHead class="w-32">类型</TableHead>
            <TableHead class="w-24">排序</TableHead>
            <TableHead class="w-40 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell :colspan="4"><Skeleton class="h-8 w-full" /></TableCell>
            </TableRow>
          </template>
          <template v-else>
            <template v-for="group in groupedModules" :key="group.key">
              <TableRow class="group-row">
                <TableCell :colspan="4">
                  <span class="group-title">{{ group.title }}</span>
                  <span class="group-note">{{ group.note }}</span>
                </TableCell>
              </TableRow>
              <TableRow v-for="row in group.items" :key="row.id">
                <TableCell>
                  <span class="font-medium">{{ row.name }}</span>
                  <span class="text-muted-foreground/70 ml-1.5 text-xs tabular-nums">#{{ row.id }}</span>
                </TableCell>
                <TableCell>
                  <Badge :variant="typeTagMap[row.type]?.type || 'secondary'">
                    {{ typeTagMap[row.type]?.label || row.type }}
                  </Badge>
                </TableCell>
                <TableCell class="text-muted-foreground tabular-nums">{{ row.sort_order }}</TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      :disabled="row.is_system"
                      :title="row.is_system ? '系统内置模块不可修改' : '编辑'"
                      @click="openEdit(row)"
                    >
                      <Pencil />编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="text-destructive hover:text-destructive"
                      :disabled="row.is_system"
                      :title="row.is_system ? '系统内置模块不可删除' : '删除'"
                      @click="handleDelete(row)"
                    >
                      <Trash2 />删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
            <TableEmpty v-if="!modules.length" :colspan="4">
              <UiEmptyState title="暂无数据" />
            </TableEmpty>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- 新增/编辑弹窗 -->
    <Dialog :open="editVisible" @update:open="(v: boolean) => (editVisible = v)">
      <DialogContent class="sm:max-w-sm" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>{{ editingId ? '编辑模块' : '新增模块' }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label for="module-name">模块名</Label>
            <Input id="module-name" v-model="form.name" placeholder="如：风格、场景、光影" maxlength="100" />
            <p class="text-muted-foreground text-right text-xs">{{ form.name.length }}/100</p>
          </div>
          <div class="grid gap-1.5">
            <Label for="module-sort">排序（数值越小越靠前）</Label>
            <UiNumberInput id="module-sort" v-model="form.sort_order" :min="0" :max="9999" />
          </div>
          <p v-if="!editingId" class="text-muted-foreground text-xs">提示：新增的模块类型固定为「元素」。</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editVisible = false">取消</Button>
          <Button :disabled="submitting" @click="handleSubmit">
            <LoaderCircle v-if="submitting" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>

<style scoped>
/* 全出血表格贴在页面灰底上：吸顶表头与吸边操作列需与底色一致 */
.table-host {
  --table-sticky-bg: var(--momo-color-bg-page);
  --table-sticky-hover-bg: color-mix(in oklab, var(--momo-color-bg-muted) 50%, var(--momo-color-bg-page));
}

/* 分组行：小标题 + 说明，充当「哪些行可以动」的分隔，而不是再套一层卡片。
   td 自带不透明底色，天然盖住 TableRow 的 hover 背景，无需再处理 hover 态。 */
.group-row td {
  background: var(--momo-color-bg-soft);
}
.group-title {
  font-size: var(--momo-font-size-xs);
  font-weight: var(--momo-font-weight-medium);
  letter-spacing: 0.04em;
  color: var(--momo-color-text-secondary);
}
.group-note {
  margin-left: 8px;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
}
</style>
