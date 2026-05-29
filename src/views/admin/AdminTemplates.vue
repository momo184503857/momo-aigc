<script setup lang="ts">
defineOptions({ name: 'AdminTemplates' })
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'

interface TmplRow {
  id: number
  username: string
  user_id: number
  name: string
  public_url: string
  original_filename: string
  mime_type: string
  size_bytes: number
  created_at: string
}

const templates = ref<TmplRow[]>([])
const loading = ref(false)
const filterUserId = ref<string>('')

async function loadTemplates() {
  loading.value = true
  try {
    const userId = filterUserId.value ? parseInt(filterUserId.value) : undefined
    const res = await adminApi.listTemplates(userId)
    templates.value = res.data.data || []
  } catch {
    error('加载失败')
  } finally {
    loading.value = false
  }
}

async function handleDelete(tmpl: TmplRow) {
  try {
    await confirmDanger({ title: '确认删除', message: '确定删除该模板记录吗？' })
    await adminApi.deleteTemplate(tmpl.id)
    success('已删除')
    await loadTemplates()
  } catch { /* cancelled */ }
}

function formatSize(bytes: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

onMounted(() => loadTemplates())
</script>

<template>
  <PageLayout>
    <template #header>
      <div style="display:flex;align-items:center;gap:16px">
        <h2>模板管理（全部用户）</h2>
        <el-input
          v-model="filterUserId"
          placeholder="按用户ID筛选"
          size="small"
          style="width:160px"
          clearable
          @keyup.enter="loadTemplates"
          @clear="loadTemplates"
        />
        <el-button size="small" @click="loadTemplates">搜索</el-button>
      </div>
    </template>

    <el-table :data="templates" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column label="预览" width="80">
        <template #default="{ row }">
          <el-image :src="row.public_url" style="width:50px;height:50px;border-radius:4px" fit="cover" preview-teleported />
        </template>
      </el-table-column>
      <el-table-column prop="username" label="用户" width="100" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="original_filename" label="原始文件名" show-overflow-tooltip />
      <el-table-column prop="mime_type" label="类型" width="100" />
      <el-table-column label="大小" width="80">
        <template #default="{ row }">{{ formatSize(row.size_bytes) }}</template>
      </el-table-column>
      <el-table-column label="上传时间" width="140">
        <template #default="{ row }">{{ row.created_at?.slice(0, 16) }}</template>
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
  </PageLayout>
</template>
