<script setup lang="ts">
/**
 * AdminPromptCases - 提示词参考案例管理页面。
 * 管理员可添加/编辑/删除官方案例图（选字段 + 关键词 + 上传图 + 填 prompt）。
 */
defineOptions({ name: 'AdminPromptCases' })
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { adminPromptCasesApi } from '@/services/promptCasesApi'
import { ossApi } from '@/services/ossApi'
import { SEGMENT_META } from '@/utils/promptAssembler'
import PageLayout from '@/components/PageLayout.vue'
import { Plus, Delete, Upload, Refresh } from '@element-plus/icons-vue'

const { success, warning, error, confirmDanger } = useUiFeedback()

interface CaseRow {
  id: number
  segment_key: string
  keyword: string
  image_url: string
  prompt_snapshot: string
  model: string
  sort_order: number
}

const cases = ref<CaseRow[]>([])
const loading = ref(false)
const filterSegment = ref('')

// 编辑弹窗
const editVisible = ref(false)
const editingCase = ref<CaseRow | null>(null)
const form = ref({
  id: null as number | null,
  segment_key: 'lighting',
  keyword: '',
  image_url: '',
  prompt_snapshot: '',
  model: '',
  sort_order: 0,
})
const uploading = ref(false)

const segmentLabels = SEGMENT_META.map((m) => ({ key: m.key, label: m.label }))

function segmentLabel(key: string): string {
  return SEGMENT_META.find((m) => m.key === key)?.label || key
}

async function loadCases() {
  loading.value = true
  try {
    const res = await adminPromptCasesApi.list(filterSegment.value || undefined)
    cases.value = res.data.data || []
  } catch (e) {
    error(e, '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingCase.value = null
  form.value = {
    id: null,
    segment_key: filterSegment.value || 'lighting',
    keyword: '',
    image_url: '',
    prompt_snapshot: '',
    model: '',
    sort_order: 0,
  }
  editVisible.value = true
}

function openEdit(row: CaseRow) {
  editingCase.value = row
  form.value = { ...row }
  editVisible.value = true
}

async function handleUpload(file: File) {
  uploading.value = true
  try {
    const { publicUrl } = await ossApi.upload(file, 'materials')
    form.value.image_url = publicUrl
    success('图片已上传')
  } catch (e) {
    error(e, '上传失败')
  } finally {
    uploading.value = false
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files[0]) {
    handleUpload(input.files[0])
  }
}

async function handleSave() {
  const f = form.value
  if (!f.segment_key || !f.keyword.trim() || !f.image_url) {
    warning('字段、关键词、图片不能为空')
    return
  }
  try {
    if (f.id) {
      await adminPromptCasesApi.update(f.id, {
        segment_key: f.segment_key,
        keyword: f.keyword,
        image_url: f.image_url,
        prompt_snapshot: f.prompt_snapshot,
        model: f.model,
        sort_order: f.sort_order,
      })
      success('已更新')
    } else {
      await adminPromptCasesApi.create({
        segment_key: f.segment_key,
        keyword: f.keyword,
        image_url: f.image_url,
        prompt_snapshot: f.prompt_snapshot,
        model: f.model,
        sort_order: f.sort_order,
      })
      success('已添加')
    }
    editVisible.value = false
    await loadCases()
  } catch (e) {
    error(e, '保存失败')
  }
}

async function handleDelete(row: CaseRow) {
  try {
    await confirmDanger({ title: '确认删除', message: `确定删除案例「${row.keyword}」吗？`, confirmText: '删除', cancelText: '取消' })
    await adminPromptCasesApi.delete(row.id)
    success('已删除')
    await loadCases()
  } catch { /* cancelled */ }
}

onMounted(() => loadCases())
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>提示词案例管理</h2>
    </template>
    <template #extra>
      <el-button type="primary" :icon="Plus" @click="openCreate">添加案例</el-button>
    </template>

    <!-- 筛选 -->
    <div class="filter-bar">
      <el-select v-model="filterSegment" placeholder="全部字段" clearable style="width: 140px" @change="loadCases">
        <el-option v-for="s in segmentLabels" :key="s.key" :label="s.label" :value="s.key" />
      </el-select>
      <el-button :icon="Refresh" @click="loadCases" circle size="small" />
    </div>

    <el-table :data="cases" v-loading="loading" stripe>
      <el-table-column label="预览" width="80">
        <template #default="{ row }">
          <img v-if="row.image_url" :src="row.image_url" class="case-thumb" />
        </template>
      </el-table-column>
      <el-table-column label="字段" width="100">
        <template #default="{ row }">{{ segmentLabel(row.segment_key) }}</template>
      </el-table-column>
      <el-table-column prop="keyword" label="关键词" width="120" />
      <el-table-column prop="prompt_snapshot" label="提示词快照" min-width="200" show-overflow-tooltip />
      <el-table-column prop="model" label="模型" width="140" />
      <el-table-column prop="sort_order" label="排序" width="70" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(row)" />
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" :title="editingCase ? '编辑案例' : '添加案例'" width="560px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="字段">
          <el-select v-model="form.segment_key" style="width: 100%">
            <el-option v-for="s in segmentLabels" :key="s.key" :label="s.label" :value="s.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="form.keyword" placeholder="如：柔光、侧光、逆光" />
        </el-form-item>
        <el-form-item label="参考图">
          <div class="upload-area">
            <div v-if="form.image_url" class="upload-preview">
              <img :src="form.image_url" alt="预览" />
              <el-button size="small" @click="form.image_url = ''">更换</el-button>
            </div>
            <label v-else class="upload-trigger" :class="{ loading: uploading }">
              <el-icon size="24"><Upload /></el-icon>
              <span>{{ uploading ? '上传中...' : '点击上传' }}</span>
              <input type="file" accept="image/*" style="display:none" @change="onFileChange" />
            </label>
          </div>
        </el-form-item>
        <el-form-item label="提示词快照（可选）">
          <el-input v-model="form.prompt_snapshot" type="textarea" :rows="3" placeholder="生成该图时的完整提示词（可复现）" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="16">
            <el-form-item label="模型（可选）">
              <el-input v-model="form.model" placeholder="如 gpt-image-2" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="排序">
              <el-input-number v-model="form.sort_order" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.case-thumb {
  width: 50px;
  height: 50px;
  border-radius: var(--momo-radius-sm);
  object-fit: cover;
}
.upload-area { width: 100%; }
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
