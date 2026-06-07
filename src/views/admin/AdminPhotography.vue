<script setup lang="ts">
defineOptions({ name: 'AdminPhotography' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error } = useUiFeedback()
import { Plus, Delete, Top, Bottom, ArrowDown } from '@element-plus/icons-vue'
import { photographyApi } from '@/services/photographyApi'
import type { PhotographyElement, PhotographyElementPrompt } from '@/services/photographyApi'
import { MODELS } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'

// ─── State ───
interface ElementWithPrompts {
  id: number
  name: string
  label: string
  max_images: number
  sort_order: number
  status: string
  created_at: string
  updated_at: string
  prompts: PromptRow[]
}

interface PromptRow {
  id: number
  element_id: number
  model_id: string
  system_prompt: string
  _dirty: boolean
}

const elements = ref<ElementWithPrompts[]>([])
const loading = ref(false)
const saving = ref(false)
const expandedElements = ref(new Set<number>())

// ─── Dialog state ───
const dialogVisible = ref(false)
const dialogTitle = ref('新增元素')
const dialogForm = ref({ name: '', label: '', max_images: 1 })
const editingId = ref<number | null>(null)

const allExpanded = computed(() =>
  expandedElements.value.size === elements.value.length && elements.value.length > 0
)

function modelDisplayName(modelId: string): string {
  const m = MODELS.find(m => m.id === modelId)
  return m?.name || modelId
}

function toggleElement(id: number) {
  const s = new Set(expandedElements.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedElements.value = s
}

function toggleAll() {
  if (allExpanded.value) {
    expandedElements.value = new Set()
  } else {
    expandedElements.value = new Set(elements.value.map(e => e.id))
  }
}

// ─── Load ───
async function load() {
  loading.value = true
  try {
    const [elRes, pRes] = await Promise.all([
      photographyApi.listElements(),
      photographyApi.listElementPrompts(),
    ])
    const elData: PhotographyElement[] = elRes.data.data || []
    const pData: PhotographyElementPrompt[] = pRes.data.data || []

    const promptMap = new Map<number, PhotographyElementPrompt[]>()
    pData.forEach(p => {
      const list = promptMap.get(p.element_id) || []
      list.push(p)
      promptMap.set(p.element_id, list)
    })

    elements.value = elData.map(el => ({
      ...el,
      prompts: (promptMap.get(el.id) || []).map(p => ({
        id: p.id,
        element_id: p.element_id,
        model_id: p.model_id,
        system_prompt: p.system_prompt,
        _dirty: false,
      })).sort((a, b) => a.model_id.localeCompare(b.model_id)),
    }))
  } catch {
    error('加载失败')
  } finally {
    loading.value = false
  }
}

// ─── Element CRUD ───
function openCreateDialog() {
  dialogTitle.value = '新增元素'
  dialogForm.value = { name: '', label: '', max_images: 1 }
  editingId.value = null
  dialogVisible.value = true
}

function openEditDialog(el: ElementWithPrompts) {
  dialogTitle.value = '编辑元素'
  dialogForm.value = { name: el.name, label: el.label, max_images: el.max_images }
  editingId.value = el.id
  dialogVisible.value = true
}

async function handleDialogConfirm() {
  const { name, label, max_images } = dialogForm.value
  if (!name.trim() || !label.trim()) {
    error('名称和标签不能为空')
    return
  }
  try {
    if (editingId.value) {
      await photographyApi.updateElement(editingId.value, { name: name.trim(), label: label.trim(), max_images })
      success('已更新')
    } else {
      const sortOrder = elements.value.length
      await photographyApi.createElement({ name: name.trim(), label: label.trim(), max_images, sort_order: sortOrder })
      success('已创建')
    }
    dialogVisible.value = false
    await load()
  } catch {
    error('操作失败')
  }
}

async function handleDelete(el: ElementWithPrompts) {
  try {
    await photographyApi.deleteElement(el.id)
    success('已删除')
    await load()
  } catch {
    error('删除失败')
  }
}

async function handleMoveUp(el: ElementWithPrompts, index: number) {
  if (index === 0) return
  const prev = elements.value[index - 1]
  await photographyApi.updateElement(el.id, { sort_order: prev.sort_order })
  await photographyApi.updateElement(prev.id, { sort_order: el.sort_order })
  await load()
}

async function handleMoveDown(el: ElementWithPrompts, index: number) {
  if (index === elements.value.length - 1) return
  const next = elements.value[index + 1]
  await photographyApi.updateElement(el.id, { sort_order: next.sort_order })
  await photographyApi.updateElement(next.id, { sort_order: el.sort_order })
  await load()
}

async function handleToggleStatus(el: ElementWithPrompts) {
  const newStatus = el.status === 'active' ? 'inactive' : 'active'
  await photographyApi.updateElement(el.id, { status: newStatus })
  await load()
}

// ─── Prompt editing ───
function markDirty(prompt: PromptRow) {
  prompt._dirty = true
}

async function saveElementPrompts(el: ElementWithPrompts) {
  saving.value = true
  let ok = 0
  for (const p of el.prompts) {
    if (!p._dirty) continue
    try {
      await photographyApi.updateElementPrompt(p.id, { system_prompt: p.system_prompt })
      p._dirty = false
      ok++
    } catch { /* skip */ }
  }
  saving.value = false
  if (ok > 0) success(`已保存 ${ok} 条`)
}

onMounted(() => load())
</script>

<template>
  <PageLayout>
    <template #header>
      <span>AI摄影配置</span>
    </template>
    <template #extra>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">新增元素</el-button>
    </template>

    <div v-loading="loading">
      <div class="toolbar">
        <el-alert
          title="为每个元素设置各模型下的系统提示词。生成时系统会按元素顺序拼接提示词，并自动附加参考图映射说明。"
          type="info" show-icon :closable="false" class="toolbar-alert"
        />
        <el-button size="small" @click="toggleAll">
          {{ allExpanded ? '全部折叠' : '全部展开' }}
        </el-button>
      </div>

      <div v-if="elements.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无元素，请点击「新增元素」添加">
          <el-button type="primary" :icon="Plus" @click="openCreateDialog">新增元素</el-button>
        </el-empty>
      </div>

      <div class="elements-list">
        <div v-for="(el, ei) in elements" :key="el.id" class="element-card"
          :class="{ inactive: el.status !== 'active' }">
          <div class="element-header" @click="toggleElement(el.id)">
            <div class="element-header-left">
              <el-icon class="chevron" :class="{ rotated: expandedElements.has(el.id) }">
                <ArrowDown />
              </el-icon>
              <span class="element-label">{{ el.label }}</span>
              <el-tag v-if="el.status !== 'active'" type="info" size="small" class="status-tag">已禁用</el-tag>
              <span class="element-meta">
                标识: {{ el.name }} · 最多 {{ el.max_images }} 张图
              </span>
            </div>
            <div class="element-header-right" @click.stop>
              <el-button size="small" :icon="Top" :disabled="ei === 0" @click="handleMoveUp(el, ei)" title="上移" />
              <el-button size="small" :icon="Bottom" :disabled="ei === elements.length - 1" @click="handleMoveDown(el, ei)" title="下移" />
              <el-button size="small" @click="openEditDialog(el)">编辑</el-button>
              <el-button size="small" @click="handleToggleStatus(el)">
                {{ el.status === 'active' ? '禁用' : '启用' }}
              </el-button>
              <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(el)" />
            </div>
          </div>

          <div v-show="expandedElements.has(el.id)" class="element-body">
            <div class="element-prompts">
              <div v-for="prompt in el.prompts" :key="prompt.id" class="prompt-row">
                <div class="prompt-model">{{ modelDisplayName(prompt.model_id) }}</div>
                <el-input
                  v-model="prompt.system_prompt"
                  type="textarea"
                  :rows="3"
                  placeholder="该元素的系统提示词（可为空）"
                  @input="markDirty(prompt)"
                />
              </div>
            </div>

            <div class="element-footer">
              <el-button
                size="small"
                type="primary"
                :loading="saving"
                @click="saveElementPrompts(el)"
              >
                保存提示词
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="480px" @close="editingId = null">
      <el-form label-width="100px">
        <el-form-item label="元素标识">
          <el-input v-model="dialogForm.name" placeholder="英文标识，如 face、pose" />
        </el-form-item>
        <el-form-item label="显示标签">
          <el-input v-model="dialogForm.label" placeholder="中文标签，如 人脸、姿势" />
        </el-form-item>
        <el-form-item label="最大图片数">
          <el-input-number v-model="dialogForm.max_images" :min="1" :max="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleDialogConfirm">确认</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: flex-start; gap: 12px;
  margin-bottom: 24px;
}
.toolbar-alert { flex: 1; }

.empty-state {
  padding: 60px 0;
  display: flex; justify-content: center;
}

.elements-list {
  display: flex; flex-direction: column; gap: 12px;
}

.element-card {
  border: 1px solid var(--el-border-color);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--el-bg-color);
}
.element-card.inactive {
  opacity: 0.6;
}

.element-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  cursor: pointer; user-select: none;
  transition: background 0.15s;
  gap: 12px;
}
.element-header:hover { background: var(--el-fill-color); }

.element-header-left {
  display: flex; align-items: center; gap: 10px;
  flex: 1; min-width: 0;
}

.chevron {
  transition: transform 0.25s;
  font-size: var(--momo-font-size-base); color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.chevron.rotated { transform: rotate(180deg); }

.element-label {
  font-size: var(--momo-font-size-base); font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.status-tag { flex-shrink: 0; }

.element-meta {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.element-header-right {
  display: flex; align-items: center; gap: 4px;
  flex-shrink: 0;
}

/* Body */
.element-body {
  padding: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.element-prompts {
  display: flex; flex-direction: column; gap: 10px;
  margin-bottom: 12px;
}

.prompt-row {
  display: flex; gap: 12px; align-items: flex-start;
}

.prompt-model {
  width: 180px; flex-shrink: 0;
  font-size: var(--momo-font-size-sm); font-weight: 500;
  color: var(--el-text-color-regular);
  padding-top: 8px;
}

.element-footer {
  display: flex; align-items: center; gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
</style>
