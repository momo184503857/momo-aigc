<script setup lang="ts">
/**
 * MaterialLibrary — AI 买家秀 · 素材库主面板。
 * 管理员可增删改查（批量上传/删除、编辑）；普通用户只能查看 + 复制。
 */
import { ref, onMounted, watch } from 'vue'
import { Grid, List, Upload, CopyDocument, Delete } from '@element-plus/icons-vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error, confirmDanger } = useUiFeedback()
import { useAuthStore } from '@/stores/auth'
import { buyerShowApi, adminBuyerShowApi, type BuyerShowMaterial, type BuyerShowTag } from '@/services/buyerShowApi'
import { useClipboard } from '@/composables/useClipboard'
const { copy } = useClipboard()
import { useImagePreview } from '@/composables/useImagePreview'
import { UiImagePreview, UiPagination } from '@/components/ui'
import MaterialCard from './MaterialCard.vue'
import MaterialUploadDialog from './MaterialUploadDialog.vue'
import MaterialEditDialog from './MaterialEditDialog.vue'

defineOptions({ name: 'MaterialLibrary' })

const auth = useAuthStore()

const materials = ref<BuyerShowMaterial[]>([])
const tags = ref<BuyerShowTag[]>([])
const loading = ref(false)

const viewMode = ref<'grid' | 'list'>('grid')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const selectedTagId = ref<number | undefined>(undefined)
const selectedIds = ref(new Set<number>())

const showUpload = ref(false)
const showEdit = ref(false)
const editing = ref<BuyerShowMaterial | null>(null)

const { visible: previewVisible, url: previewUrl, open: openPreview } = useImagePreview()

async function load() {
  loading.value = true
  try {
    const api = auth.isAdmin ? adminBuyerShowApi : buyerShowApi
    const res = await api.list({ page: currentPage.value, pageSize: pageSize.value, tagId: selectedTagId.value })
    const data = res.data.data
    materials.value = data.records || []
    total.value = data.total || 0
  } catch {
    error('加载素材库失败')
  } finally {
    loading.value = false
  }
}

async function loadTags() {
  try {
    const api = auth.isAdmin ? adminBuyerShowApi : buyerShowApi
    const res = await api.listTags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}

function toggleSelect(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function clearSelection() {
  selectedIds.value = new Set()
}

function copyOne(m: BuyerShowMaterial) {
  if (!m.prompt) { warning('该素材没有提示词'); return }
  copy(m.prompt, { successMsg: '已复制提示词' })
}

function copySelected() {
  const picked = materials.value.filter(m => selectedIds.value.has(m.id))
  if (picked.length === 0) return
  const text = picked
    .map(m => (m.prompt || '').replace(/\r?\n/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  if (!text) { warning('选中的素材没有可复制的提示词'); return }
  copy(text, { successMsg: `已复制 ${picked.length} 条提示词` })
  clearSelection()
}

function openEdit(m: BuyerShowMaterial) {
  editing.value = m
  showEdit.value = true
}

async function handleDelete(m: BuyerShowMaterial) {
  try {
    await confirmDanger({ title: '确认删除', message: '确定删除该素材吗？', confirmText: '删除' })
    await adminBuyerShowApi.batchDelete([m.id])
    success('已删除')
    selectedIds.value = new Set([...selectedIds.value].filter(x => x !== m.id))
    await load()
    await loadTags()
  } catch { /* cancelled */ }
}

async function batchDeleteSelected() {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  try {
    await confirmDanger({
      title: '批量删除',
      message: `确定删除选中的 ${ids.length} 条素材吗？此操作不可恢复。`,
      confirmText: '删除',
    })
    const res = await adminBuyerShowApi.batchDelete(ids)
    success(`已删除 ${res.data.data.deleted} 条`)
    clearSelection()
    await load()
    await loadTags()
  } catch { /* cancelled */ }
}

function onPageChange() {
  load()
}
function onPageSize() {
  currentPage.value = 1
  load()
}

async function onUploadDone() {
  currentPage.value = 1
  await load()
  await loadTags()
}
async function onEditDone() {
  await load()
  await loadTags()
}

watch(selectedTagId, () => {
  currentPage.value = 1
  load()
})

onMounted(() => {
  load()
  loadTags()
})
</script>

<template>
  <div class="material-library">
    <!-- 工具栏 -->
    <div class="lib-header">
      <el-button v-if="auth.isAdmin" type="primary" :icon="Upload" @click="showUpload = true">批量上传</el-button>
      <el-button-group class="lib-view-toggle">
        <el-button :type="viewMode === 'grid' ? 'primary' : 'default'" @click="viewMode = 'grid'">
          <el-icon><Grid /></el-icon>
        </el-button>
        <el-button :type="viewMode === 'list' ? 'primary' : 'default'" @click="viewMode = 'list'">
          <el-icon><List /></el-icon>
        </el-button>
      </el-button-group>
    </div>

    <!-- 标签筛选 -->
    <div v-if="tags.length > 0" class="tag-filter">
      <el-tag
        :type="!selectedTagId ? 'primary' : 'info'"
        size="small"
        class="tag-chip"
        @click="selectedTagId = undefined"
      >全部</el-tag>
      <el-tag
        v-for="tag in tags"
        :key="tag.id"
        :type="selectedTagId === tag.id ? 'primary' : 'info'"
        size="small"
        class="tag-chip"
        @click="selectedTagId = tag.id"
      >{{ tag.name }} ({{ tag.usage_count }})</el-tag>
    </div>

    <!-- 批量条 -->
    <div v-if="selectedIds.size > 0" class="batch-bar">
      <span class="batch-info">已选择 {{ selectedIds.size }} 项</span>
      <el-button size="small" @click="clearSelection">取消</el-button>
      <el-button size="small" type="primary" :icon="CopyDocument" @click="copySelected">复制选中提示词</el-button>
      <el-button v-if="auth.isAdmin" size="small" type="danger" :icon="Delete" @click="batchDeleteSelected">批量删除</el-button>
    </div>

    <!-- 内容 -->
    <div v-loading="loading" class="lib-content">
      <el-empty v-if="!loading && materials.length === 0" description="暂无素材" :image-size="60" />
      <div v-else :class="viewMode === 'grid' ? 'material-grid' : 'material-list'">
        <MaterialCard
          v-for="m in materials"
          :key="m.id"
          :material="m"
          :view-mode="viewMode"
          :selected="selectedIds.has(m.id)"
          :is-admin="auth.isAdmin"
          @toggle-select="toggleSelect(m.id)"
          @preview="openPreview(m.public_url)"
          @copy="copyOne(m)"
          @edit="openEdit(m)"
          @delete="handleDelete(m)"
        />
      </div>
    </div>

    <!-- 分页（右下角） -->
    <div class="lib-footer">
      <UiPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 40, 60, 100]"
        @current-change="onPageChange"
        @size-change="onPageSize"
      />
    </div>

    <!-- 管理员弹窗 -->
    <MaterialUploadDialog v-if="auth.isAdmin" v-model="showUpload" @done="onUploadDone" />
    <MaterialEditDialog v-if="auth.isAdmin" v-model="showEdit" :material="editing" @done="onEditDone" />

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
  </div>
</template>

<style scoped>
.material-library {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lib-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lib-view-toggle {
  margin-left: auto;
}

/* 标签筛选 */
.tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-chip {
  cursor: pointer;
  user-select: none;
}

/* 批量条 */
.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: var(--el-border-radius-base);
}
.batch-info {
  font-size: var(--momo-font-size-base);
  color: var(--el-color-primary);
  margin-right: auto;
}

/* 内容 */
.lib-content {
  min-height: 120px;
}
.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.material-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 分页 */
.lib-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 2px;
}
</style>
