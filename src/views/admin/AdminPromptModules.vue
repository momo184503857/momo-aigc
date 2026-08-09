<script setup lang="ts">
/**
 * AdminPromptModules - 提示词工坊 · 模块管理页面。
 *
 * 模块类型：requirement（要求）/ element（元素）/ forbidden（禁止出现）。
 * 「要求」「禁止出现」为系统内置（is_system=1），不可改名、不可删除；
 * 管理员在此基础上自由增删「元素」模块（风格/场景/光影/构图/画质等）。
 */
defineOptions({ name: 'AdminPromptModules' })
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import PageLayout from '@/components/PageLayout.vue'
import { adminPromptModulesApi } from '@/services/promptCardsApi'
import { Plus, Edit, Delete, Refresh } from '@element-plus/icons-vue'

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

const typeTagMap: Record<string, { label: string; type: string }> = {
  requirement: { label: '要求', type: 'warning' },
  element: { label: '元素', type: 'primary' },
  forbidden: { label: '禁止出现', type: 'danger' },
}

// 编辑/新增弹窗
const editVisible = ref(false)
const editingId = ref<number | null>(null)
const form = ref({ name: '', sort_order: 0 })
const submitting = ref(false)

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
  <PageLayout>
    <template #header>
      <h2>提示词模块管理</h2>
    </template>

    <div class="toolbar">
      <div class="hint">
        「要求」「禁止出现」为系统内置模块（拼接时固定首尾，不可改名/删除）；管理员可自由增删「元素」模块（风格/场景/光影/构图/画质等）。
      </div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" circle size="small" @click="loadModules" />
        <el-button type="primary" :icon="Plus" @click="openCreate">新增模块</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="modules" border stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="name" label="模块名" min-width="160" />
      <el-table-column label="类型" width="130">
        <template #default="{ row }">
          <el-tag :type="(typeTagMap[row.type]?.type as any) || 'info'" size="small" effect="plain">
            {{ typeTagMap[row.type]?.label || row.type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sort_order" label="排序" width="90" />
      <el-table-column label="系统内置" width="110" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_system" type="info" size="small">系统</el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            :icon="Edit"
            :disabled="row.is_system"
            :title="row.is_system ? '系统内置模块不可修改' : '编辑'"
            @click="openEdit(row)"
          >编辑</el-button>
          <el-button
            size="small"
            type="danger"
            :icon="Delete"
            :disabled="row.is_system"
            :title="row.is_system ? '系统内置模块不可删除' : '删除'"
            @click="handleDelete(row)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="editVisible" :title="editingId ? '编辑模块' : '新增模块'" width="420px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="模块名">
          <el-input v-model="form.name" placeholder="如：风格、场景、光影" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="排序（数值越小越靠前）">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" controls-position="right" />
        </el-form-item>
        <div class="dialog-tip">提示：新增的模块类型固定为「元素」。</div>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.hint {
  flex: 1;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  background: var(--el-color-primary-light-9);
  border-radius: var(--momo-radius-md);
  padding: 10px 14px;
}
.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.muted {
  color: var(--el-text-color-placeholder);
}
.dialog-tip {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
}
</style>
