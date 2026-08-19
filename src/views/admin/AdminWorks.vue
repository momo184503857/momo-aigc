<script setup lang="ts">
/**
 * AdminWorks - 作品库管理页面。
 * 管理员可查看全部作品（含已下架）、上架/下架、删除、发布官方种子作品、管理标签。
 */
defineOptions({ name: 'AdminWorks' })
import { ref, onMounted } from 'vue'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { adminWorksApi } from '@/services/worksApi'
import type { WorkItem } from '@/services/worksApi'
import { FEATURE_CONFIGS, getFeatureLabel } from '@/configs/featureConfig'
import { useModelCatalogStore } from '@/stores/modelCatalog'

const modelCatalog = useModelCatalogStore()
import PageLayout from '@/components/PageLayout.vue'
import { Search, Refresh, Delete, Plus, Upload } from '@element-plus/icons-vue'
import { ossApi } from '@/services/ossApi'

const { success, warning, error, confirmDanger } = useUiFeedback()

const works = ref<WorkItem[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterStatus = ref('')
const keyword = ref('')

// 官方发布弹窗
const officialVisible = ref(false)
const officialForm = ref({
  remark: '',
  image_url: '',
  prompt: '',
  user_prompt: '',
  negative_prompt: '',
  model: 'gpt-image-2',
  resolution: '2K',
  aspect_ratio: '1:1',
  feature_id: 'free-gen',
  tagIds: [] as number[],
})
const uploadingImage = ref(false)

// 标签管理
const tags = ref<{ id: number; name: string; usage_count: number }[]>([])
const newTagName = ref('')

const featureOptions = [
  { id: 'free-gen', label: '自由生图' },
  ...Object.keys(FEATURE_CONFIGS).map((k) => ({ id: k, label: FEATURE_CONFIGS[k].label })),
]

function modelDisplayName(modelId: string): string {
  return modelCatalog.displayNameFor(modelId)
}

async function loadWorks() {
  loading.value = true
  try {
    const res = await adminWorksApi.list({
      page: page.value,
      pageSize: pageSize.value,
      status: filterStatus.value || undefined,
      keyword: keyword.value.trim() || undefined,
    })
    works.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
  } catch (e) {
    error(e, '加载作品列表失败')
  } finally {
    loading.value = false
  }
}

async function loadTags() {
  try {
    const res = await adminWorksApi.tags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}

async function handleStatusChange(work: WorkItem, status: 'published' | 'hidden') {
  try {
    await adminWorksApi.updateStatus(work.id, status)
    work.status = status
    success(status === 'published' ? '已上架' : '已下架')
  } catch (e) {
    error(e, '操作失败')
  }
}

async function handleDelete(work: WorkItem) {
  try {
    await confirmDanger({ title: '确认删除', message: '确定删除该作品吗？此操作不可恢复。', confirmText: '删除', cancelText: '取消' })
    await adminWorksApi.delete(work.id)
    success('已删除')
    await loadWorks()
  } catch { /* cancelled */ }
}

async function handleUploadImage(file: File) {
  uploadingImage.value = true
  try {
    const { publicUrl } = await ossApi.upload(file, 'materials')
    officialForm.value.image_url = publicUrl
    success('图片已上传')
  } catch (e) {
    error(e, '上传失败')
  } finally {
    uploadingImage.value = false
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files[0]) {
    handleUploadImage(input.files[0])
  }
}

async function handlePublishOfficial() {
  const f = officialForm.value
  if (!f.image_url || !f.prompt.trim() || !f.model) {
    warning('图片、提示词、模型不能为空')
    return
  }
  try {
    await adminWorksApi.publishOfficial({
      remark: f.remark.trim(),
      image_url: f.image_url,
      prompt: f.prompt.trim(),
      user_prompt: f.user_prompt.trim(),
      negative_prompt: f.negative_prompt.trim(),
      model: f.model,
      resolution: f.resolution,
      aspect_ratio: f.aspect_ratio,
      feature_id: f.feature_id,
      tagIds: f.tagIds,
    })
    success('官方作品已发布')
    officialVisible.value = false
    officialForm.value = {
      remark: '', image_url: '', prompt: '', user_prompt: '',
      negative_prompt: '', model: 'gpt-image-2', resolution: '2K', aspect_ratio: '1:1',
      feature_id: 'free-gen', tagIds: [],
    }
    await loadWorks()
  } catch (e) {
    error(e, '发布失败')
  }
}

async function handleCreateTag() {
  if (!newTagName.value.trim()) return
  try {
    await adminWorksApi.createTag(newTagName.value.trim())
    newTagName.value = ''
    success('标签已创建')
    await loadTags()
  } catch (e) {
    error(e, '创建失败')
  }
}

async function handleDeleteTag(id: number) {
  try {
    await confirmDanger({ title: '确认删除', message: '删除标签将解除与所有作品的关联，确定删除吗？', confirmText: '删除', cancelText: '取消' })
    await adminWorksApi.deleteTag(id)
    success('已删除')
    await loadTags()
  } catch { /* cancelled */ }
}

function handlePageChange(p: number) {
  page.value = p
  loadWorks()
}

function openOfficial() {
  officialVisible.value = true
}

onMounted(() => {
  loadWorks()
  loadTags()
})
</script>

<template>
  <PageLayout>
    <template #header>
      <div class="admin-header">
        <h2>作品库管理</h2>
      </div>
    </template>
    <template #extra>
      <el-button type="primary" :icon="Plus" @click="openOfficial">发布官方作品</el-button>
    </template>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索提示词"
        clearable
        style="width: 240px"
        @keyup.enter="() => { page = 1; loadWorks() }"
        @clear="() => { page = 1; loadWorks() }"
      />
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 120px" @change="() => { page = 1; loadWorks() }">
        <el-option label="已发布" value="published" />
        <el-option label="已下架" value="hidden" />
      </el-select>
      <el-button :icon="Refresh" @click="loadWorks" circle size="small" />
    </div>

    <!-- 作品表格 -->
    <el-table :data="works" v-loading="loading" stripe style="width: 100%">
      <el-table-column label="作品" min-width="200">
        <template #default="{ row }">
          <div class="work-cell">
            <img v-if="row.image_url" :src="row.image_url" class="work-thumb" />
            <div class="work-cell-info">
              <div class="work-cell-title">
                <el-tag v-if="row.is_official" type="warning" size="small">官方</el-tag>
              </div>
              <div class="work-cell-prompt">{{ row.prompt?.slice(0, 60) }}{{ row.prompt?.length > 60 ? '...' : '' }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="模式" width="100">
        <template #default="{ row }">
          {{ getFeatureLabel(row.feature_id || 'free-gen') }}
        </template>
      </el-table-column>
      <el-table-column label="模型" width="140">
        <template #default="{ row }">{{ modelDisplayName(row.model) }}</template>
      </el-table-column>
      <el-table-column label="作者" width="100">
        <template #default="{ row }">{{ row.nickname || row.username || '-' }}</template>
      </el-table-column>
      <el-table-column label="互动" width="120">
        <template #default="{ row }">
          <span class="stat">赞{{ row.like_count }}</span>
          <span class="stat">藏{{ row.favorite_count }}</span>
          <span class="stat">用{{ row.reuse_count }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
            {{ row.status === 'published' ? '已发布' : '已下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" width="150">
        <template #default="{ row }">{{ toBJMinute(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'published'"
            size="small"
            @click="handleStatusChange(row, 'hidden')"
          >下架</el-button>
          <el-button
            v-else
            size="small"
            type="primary"
            @click="handleStatusChange(row, 'published')"
          >上架</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(row)" />
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="admin-pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        background
        @current-change="handlePageChange"
      />
    </div>

    <!-- 标签管理 -->
    <div class="tags-section">
      <div class="tags-section-title">标签管理</div>
      <div class="tags-input-row">
        <el-input v-model="newTagName" placeholder="输入标签名" style="width: 200px" @keyup.enter="handleCreateTag" />
        <el-button type="primary" :icon="Plus" @click="handleCreateTag">添加</el-button>
      </div>
      <div class="tags-list">
        <el-tag
          v-for="t in tags"
          :key="t.id"
          closable
          @close="handleDeleteTag(t.id)"
          class="tag-item"
        >
          {{ t.name }} ({{ t.usage_count }})
        </el-tag>
      </div>
    </div>

    <!-- 官方作品发布弹窗 -->
    <el-dialog v-model="officialVisible" title="发布官方作品" width="640px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="作品图片">
          <div class="upload-area">
            <div v-if="officialForm.image_url" class="upload-preview">
              <img :src="officialForm.image_url" alt="预览" />
              <el-button size="small" @click="officialForm.image_url = ''">更换</el-button>
            </div>
            <label v-else class="upload-trigger" :class="{ loading: uploadingImage }">
              <el-icon size="24"><Upload /></el-icon>
              <span>{{ uploadingImage ? '上传中...' : '点击上传图片' }}</span>
              <input type="file" accept="image/*" style="display:none" @change="onFileChange" />
            </label>
          </div>
        </el-form-item>
        <el-form-item label="提示词">
          <el-input v-model="officialForm.prompt" type="textarea" :rows="4" placeholder="完整提示词" />
        </el-form-item>
        <el-form-item label="负向规避词（可选）">
          <el-input v-model="officialForm.negative_prompt" type="textarea" :rows="2" placeholder="如：模糊、低质量、多余手指" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="模式">
              <el-select v-model="officialForm.feature_id" style="width: 100%">
                <el-option v-for="f in featureOptions" :key="f.id" :label="f.label" :value="f.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="模型">
              <el-select v-model="officialForm.model" style="width: 100%">
                <el-option v-for="m in modelCatalog.flatImageModels" :key="m.id" :label="m.displayName" :value="m.modelId" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="分辨率">
              <el-input v-model="officialForm.resolution" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="宽高比">
              <el-input v-model="officialForm.aspect_ratio" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="标签（可选）">
          <el-select v-model="officialForm.tagIds" multiple filterable placeholder="选择标签" style="width: 100%">
            <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="officialVisible = false">取消</el-button>
        <el-button type="primary" @click="handlePublishOfficial">发布</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.admin-header h2 {
  margin: 0;
  font-size: var(--momo-font-size-xl);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.work-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}
.work-thumb {
  width: 50px;
  height: 50px;
  border-radius: var(--momo-radius-sm);
  object-fit: cover;
  flex-shrink: 0;
}
.work-cell-info {
  min-width: 0;
}
.work-cell-title {
  font-weight: 600;
  font-size: var(--momo-font-size-sm);
  display: flex;
  align-items: center;
  gap: 6px;
}
.work-cell-prompt {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.stat {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
  margin-right: 6px;
}

.admin-pagination {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.tags-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.tags-section-title {
  font-size: var(--momo-font-size-base);
  font-weight: 600;
  margin-bottom: 12px;
}
.tags-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-item {
  cursor: default;
}

.upload-area {
  width: 100%;
}
.upload-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}
.upload-preview img {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: var(--momo-radius-sm);
  border: 1px solid var(--el-border-color-lighter);
}
.upload-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100px;
  height: 100px;
  border: 2px dashed var(--el-border-color);
  border-radius: var(--momo-radius-sm);
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: border-color 0.2s, color 0.2s;
}
.upload-trigger:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.upload-trigger.loading {
  opacity: 0.6;
  pointer-events: none;
}
</style>
