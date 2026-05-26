<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import { promptLibraryApi } from '@/services/promptLibraryApi'
import type { PromptLibraryItem } from '@/services/promptLibraryApi'
import PageLayout from '@/components/PageLayout.vue'

const items = ref<PromptLibraryItem[]>([])
const dialogVisible = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref<any>(null)

const form = ref({ name: '', content: '', tags: [] as string[] })

const allTags = ref<string[]>([])
const activeTag = ref<string | undefined>(undefined)

const filteredItems = computed(() => {
  if (!activeTag.value) return items.value
  return items.value.filter((item) => item.tags.includes(activeTag.value!))
})

async function loadList() {
  try {
    const res = await promptLibraryApi.list()
    items.value = res.data.data || []
    const tagSet = new Set<string>()
    for (const item of items.value) {
      for (const tag of item.tags) tagSet.add(tag)
    }
    allTags.value = Array.from(tagSet).sort()
  } catch { /* silent */ }
}

function openCreate() {
  isEditing.value = false
  editingId.value = null
  form.value = { name: '', content: '', tags: [] }
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function openEdit(item: PromptLibraryItem) {
  isEditing.value = true
  editingId.value = item.id
  form.value = { name: item.name, content: item.content, tags: [...item.tags] }
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function handleSave() {
  if (!formRef.value) return
  try { await formRef.value.validate() } catch { return }

  saving.value = true
  try {
    if (isEditing.value && editingId.value) {
      await promptLibraryApi.update(editingId.value, form.value)
      success('已更新')
    } else {
      await promptLibraryApi.create(form.value)
      success('已创建')
    }
    dialogVisible.value = false
    await loadList()
  } catch (e: any) {
    error(e.response?.data?.error || e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(item: PromptLibraryItem) {
  try {
    await confirmDanger({ title: '确认删除', message: `确定删除「${item.name}」吗？`, confirmText: '删除', cancelText: '取消' })
  } catch { return }
  try {
    await promptLibraryApi.delete(item.id)
    success('已删除')
    await loadList()
  } catch (e: any) {
    error(e.message || '删除失败')
  }
}

const rules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }],
}

onMounted(loadList)
</script>

<template>
  <PageLayout>
    <template #header><h2>提示词库</h2></template>
    <template #extra>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建提示词</el-button>
    </template>

    <!-- Tag filter -->
    <div v-if="allTags.length > 0" class="tag-filter">
      <el-tag
        :type="!activeTag ? 'primary' : 'info'"
        size="small"
        class="tag-chip"
        @click="activeTag = undefined"
      >
        全部
      </el-tag>
      <el-tag
        v-for="tag in allTags"
        :key="tag"
        :type="activeTag === tag ? 'primary' : 'info'"
        size="small"
        class="tag-chip"
        @click="activeTag = tag"
      >
        {{ tag }}
      </el-tag>
    </div>

    <el-empty v-if="!filteredItems.length" description="暂无提示词，点击右上角创建" :image-size="60" />

    <div v-else class="prompt-list">
      <div v-for="item in filteredItems" :key="item.id" class="prompt-item">
        <div class="item-main">
          <div class="item-name">{{ item.name }}</div>
          <div class="item-content">{{ item.content }}</div>
          <div v-if="item.tags.length" class="item-tags">
            <el-tag v-for="tag in item.tags" :key="tag" size="small">{{ tag }}</el-tag>
          </div>
        </div>
        <div class="item-actions">
          <el-button size="small" :icon="Edit" @click="openEdit(item)">编辑</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="handleDelete(item)">删除</el-button>
        </div>
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="isEditing ? '编辑提示词' : '新建提示词'" width="560px" :close-on-click-modal="false">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="60px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="提示词名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="内容" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="6" placeholder="请输入提示词内容" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="form.tags" multiple filterable allow-create default-first-option
            placeholder="输入标签后回车" style="width: 100%"
          >
            <el-option v-for="tag in allTags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.tag-filter {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 14px;
}
.tag-chip { cursor: pointer; user-select: none; }

.prompt-list { display: flex; flex-direction: column; gap: 8px; }
.prompt-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px; background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md); border: 1px solid var(--el-border-color-light);
}
.item-main { flex: 1; min-width: 0; }
.item-name { font-weight: 600; font-size: var(--momo-font-size-base); color: var(--el-text-color-primary); margin-bottom: 4px; }
.item-content {
  font-size: var(--momo-font-size-sm); color: var(--el-text-color-regular); white-space: pre-wrap; word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.item-tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.item-actions { flex-shrink: 0; display: flex; gap: 4px; }
</style>
