<script setup lang="ts">
defineOptions({ name: 'PromptLibraryPage' })
import { ref, onMounted } from 'vue'
import { Plus, Pencil, Trash2, Star, LoaderCircle } from '@lucide/vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error, confirmDanger } = useUiFeedback()
import { promptLibraryApi } from '@/services/promptLibraryApi'
import type { PromptLibraryItem } from '@/services/promptLibraryApi'
import { usePromptLibrary } from '@/composables/usePromptLibrary'
import {
  Button, Input, Textarea, Badge, Switch, UiEmptyState, UiPagination,
  DsPage, DsSection, DsField, Skeleton,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/design-system'

// 列表/筛选/分页/收藏 共享逻辑
const {
  loading, allTags, displayItems, total,
  keyword, activeTag, onlyFavorites, page, pageSize,
  load, toggleFavorite,
} = usePromptLibrary({ pageSize: 10 })

const dialogVisible = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formErrors = ref<{ name?: string; content?: string }>({})

const form = ref({ name: '', content: '', tags: [] as string[] })
const tagInput = ref('')

async function loadList() {
  await load()
}

function openCreate() {
  isEditing.value = false
  editingId.value = null
  form.value = { name: '', content: '', tags: [] }
  tagInput.value = ''
  formErrors.value = {}
  dialogVisible.value = true
}

function openEdit(item: PromptLibraryItem) {
  isEditing.value = true
  editingId.value = item.id
  form.value = { name: item.name, content: item.content, tags: [...item.tags] }
  tagInput.value = ''
  formErrors.value = {}
  dialogVisible.value = true
}

function addTagFromInput() {
  const t = tagInput.value.trim()
  if (!t) return
  if (!form.value.tags.includes(t)) form.value.tags = [...form.value.tags, t]
  tagInput.value = ''
}

function removeTag(tag: string) {
  form.value.tags = form.value.tags.filter((t) => t !== tag)
}

function validate(): boolean {
  const errs: { name?: string; content?: string } = {}
  if (!form.value.name.trim()) errs.name = '请输入名称'
  if (!form.value.content.trim()) errs.content = '请输入内容'
  formErrors.value = errs
  return Object.keys(errs).length === 0
}

async function handleSave() {
  if (saving.value || !validate()) return

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

onMounted(loadList)
</script>

<template>
  <DsPage title="提示词库">
    <template #actions><Button @click="openCreate"><Plus />新建提示词</Button></template>
    <template #filters>
      <div class="ds-row">
        <Input v-model="keyword" aria-label="搜索提示词" placeholder="搜索提示词标题和正文" />
        <div class="ds-row"><Switch id="prompt-favorites" v-model="onlyFavorites" aria-label="仅看收藏" /><label for="prompt-favorites" class="ds-caption">仅看收藏</label></div>
      </div>
      <div v-if="allTags.length" class="ds-row" role="group" aria-label="标签筛选">
        <Button size="sm" :variant="!activeTag ? 'default' : 'outline'" :aria-pressed="!activeTag" @click="activeTag = undefined">全部</Button>
        <Button v-for="tag in allTags" :key="tag" size="sm" :variant="activeTag === tag ? 'default' : 'outline'" :aria-pressed="activeTag === tag" @click="activeTag = tag">{{ tag }}</Button>
      </div>
    </template>
    <div v-if="loading" role="status" aria-label="正在加载提示词" class="ds-stack"><Skeleton v-for="n in 3" :key="n" class="h-20" /></div>
    <UiEmptyState v-else-if="!displayItems.length" title="暂无提示词" description="调整筛选条件或新建提示词" />
    <div v-else class="ds-stack">
      <DsSection v-for="item in displayItems" :key="item.id" :title="item.name">
        <template #actions>
          <Button size="icon-sm" :variant="item.is_starred ? 'secondary' : 'ghost'" :aria-label="`${item.is_starred ? '取消收藏' : '收藏'}${item.name}`" :aria-pressed="item.is_starred" @click="toggleFavorite(item)"><Star /></Button>
        </template>
        <p class="ds-content-excerpt">{{ item.content }}</p>
        <div class="ds-row">
          <Badge v-if="Object.values(item.segments || {}).some(Boolean)" variant="success">结构化</Badge>
          <Badge v-for="tag in item.tags" :key="tag" variant="secondary">{{ tag }}</Badge>
        </div>
        <template #footer>
          <Button size="sm" variant="outline" @click="openEdit(item)"><Pencil />编辑</Button>
          <Button size="sm" variant="destructive" @click="handleDelete(item)"><Trash2 />删除</Button>
        </template>
      </DsSection>
    </div>
    <template #footer>
      <UiPagination v-if="total > pageSize" v-model:current-page="page" :page-size="pageSize" :page-sizes="[pageSize]" :total="total" />
    </template>
    <Dialog :open="dialogVisible" @update:open="(v: boolean) => { if (!saving) dialogVisible = v }">
      <DialogContent class="sm:max-w-4xl" @pointer-down-outside.prevent>
        <DialogHeader><DialogTitle>{{ isEditing ? '编辑提示词' : '新建提示词' }}</DialogTitle><DialogDescription>设置标签、名称和提示词内容。</DialogDescription></DialogHeader>
        <form id="prompt-edit-form" class="ds-stack" @submit.prevent="handleSave">
          <DsField v-slot="field" label="标签">
            <div class="ds-row">
              <div v-for="tag in form.tags" :key="tag" class="ds-row"><Badge variant="secondary">{{ tag }}</Badge><Button size="icon-sm" variant="destructive" :disabled="saving" :aria-label="`移除标签${tag}`" @click="removeTag(tag)">×</Button></div>
              <Input :id="field.id" v-model="tagInput" :aria-describedby="field.describedby" placeholder="输入标签后回车" :disabled="saving" list="prompt-tag-options" @keydown.enter.prevent="addTagFromInput" />
              <datalist id="prompt-tag-options"><option v-for="tag in allTags" :key="tag" :value="tag" /></datalist>
            </div>
          </DsField>
          <DsField v-slot="field" label="名称" required :error="formErrors.name">
            <Input :id="field.id" v-model="form.name" :aria-describedby="field.describedby" :aria-invalid="field.invalid" :disabled="saving" placeholder="提示词名称" maxlength="100" />
          </DsField>
          <DsField v-slot="field" label="内容" required :error="formErrors.content">
            <Textarea :id="field.id" v-model="form.content" :aria-describedby="field.describedby" :aria-invalid="field.invalid" :disabled="saving" :rows="6" placeholder="请输入提示词内容" />
          </DsField>
        </form>
        <DialogFooter>
          <Button variant="outline" :disabled="saving" @click="dialogVisible = false">取消</Button>
          <Button type="submit" form="prompt-edit-form" :disabled="saving" :aria-busy="saving"><LoaderCircle v-if="saving" class="animate-spin" />保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </DsPage>
</template>
