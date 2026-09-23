<script setup lang="ts">
defineOptions({ name: 'PromptLibraryPage' })
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Pencil, Trash2, Search, Star, Wand2, LoaderCircle } from '@lucide/vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error, confirmDanger } = useUiFeedback()
import { promptLibraryApi } from '@/services/promptLibraryApi'
import type { PromptLibraryItem } from '@/services/promptLibraryApi'
import { usePromptLibrary } from '@/composables/usePromptLibrary'
import { hasSegments } from '@/utils/promptAssembler'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { UiEmptyState, UiPagination } from '@/components/ui'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const router = useRouter()

// 列表/筛选/分页/收藏 共享逻辑
const {
  items, allTags, displayItems, total,
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
  if (!validate()) return

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

// 在提示词工坊中编辑结构化提示词
function editInWorkshop(item: PromptLibraryItem) {
  router.push({ path: '/prompt-workshop', query: { edit: item.id } })
}

// 新建结构化提示词（跳转工坊）
function createStructured() {
  router.push('/prompt-workshop')
}

onMounted(loadList)
</script>

<template>
  <PageLayout>
    <template #header><h2>提示词库</h2></template>
    <template #extra>
      <Button variant="outline" size="sm" @click="createStructured"><Wand2 />提示词工坊</Button>
      <Button size="sm" @click="openCreate"><Plus />新建提示词</Button>
    </template>

    <!-- 筛选容器 -->
    <div class="filter-bar">
      <div class="relative w-80 max-w-full">
        <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input v-model="keyword" placeholder="搜索提示词标题和正文" class="pl-8" />
      </div>
      <div class="filter-fav">
        <span class="filter-fav-label">仅看收藏</span>
        <Switch v-model="onlyFavorites" />
      </div>
    </div>

    <!-- 标签筛选条 -->
    <div v-if="allTags.length > 0" class="tag-filter">
      <Badge
        :variant="!activeTag ? 'default' : 'secondary'"
        class="tag-chip"
        @click="activeTag = undefined"
      >
        全部
      </Badge>
      <Badge
        v-for="tag in allTags"
        :key="tag"
        :variant="activeTag === tag ? 'default' : 'secondary'"
        class="tag-chip"
        @click="activeTag = tag"
      >
        {{ tag }}
      </Badge>
    </div>

    <UiEmptyState v-if="!displayItems.length" title="暂无提示词，点击右上角创建" />

    <div v-else class="prompt-list">
      <div v-for="item in displayItems" :key="item.id" class="prompt-item">
        <Star
          class="fav-btn"
          :class="{ active: item.is_starred }"
          @click="toggleFavorite(item)"
        />
        <div class="item-main">
          <div class="item-name">
            {{ item.name }}
            <Badge v-if="hasSegments(item.segments)" variant="success" class="struct-badge">结构化</Badge>
          </div>
          <div class="item-content">{{ item.content }}</div>
          <div v-if="item.tags.length" class="item-tags">
            <Badge v-for="tag in item.tags" :key="tag" variant="secondary">{{ tag }}</Badge>
          </div>
        </div>
        <div class="item-actions">
          <Button v-if="hasSegments(item.segments)" size="sm" variant="outline" @click="editInWorkshop(item)"><Wand2 />工坊编辑</Button>
          <Button size="sm" variant="outline" @click="openEdit(item)"><Pencil />编辑</Button>
          <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" @click="handleDelete(item)"><Trash2 />删除</Button>
        </div>
      </div>
    </div>

    <!-- 分页器 -->
    <div v-if="total > pageSize" class="pagination-wrap">
      <UiPagination
        v-model:current-page="page"
        :page-size="pageSize"
        :page-sizes="[pageSize]"
        :total="total"
      />
    </div>

    <Dialog :open="dialogVisible" @update:open="(v: boolean) => (dialogVisible = v)">
      <DialogContent class="edit-dialog sm:max-w-4xl" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>{{ isEditing ? '编辑提示词' : '新建提示词' }}</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label>标签</Label>
            <div class="flex flex-wrap items-center gap-1.5">
              <Badge v-for="tag in form.tags" :key="tag" variant="secondary" class="gap-1">
                {{ tag }}
                <button type="button" class="hover:text-destructive cursor-pointer" @click="removeTag(tag)">×</button>
              </Badge>
              <Input
                v-model="tagInput"
                placeholder="输入标签后回车"
                class="h-7 w-40 text-[0.8rem]"
                list="prompt-tag-options"
                @keyup.enter.prevent="addTagFromInput"
              />
              <datalist id="prompt-tag-options">
                <option v-for="tag in allTags" :key="tag" :value="tag" />
              </datalist>
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label for="prompt-name">名称</Label>
            <Input id="prompt-name" v-model="form.name" placeholder="提示词名称" maxlength="100" />
            <p v-if="formErrors.name" class="text-destructive text-xs">{{ formErrors.name }}</p>
          </div>
          <div class="grid gap-1.5">
            <Label for="prompt-content">内容</Label>
            <Textarea id="prompt-content" v-model="form.content" :rows="6" placeholder="请输入提示词内容" />
            <p v-if="formErrors.content" class="text-destructive text-xs">{{ formErrors.content }}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="dialogVisible = false">取消</Button>
          <Button :disabled="saving" @click="handleSave">
            <LoaderCircle v-if="saving" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>

<style scoped>
.filter-bar {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 12px;
}
.filter-fav { display: flex; align-items: center; gap: 8px; }
.filter-fav-label { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); }

.tag-filter {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 14px;
}
.tag-chip { cursor: pointer; user-select: none; }

.prompt-list { display: flex; flex-direction: column; gap: 8px; }
.prompt-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px; background: var(--momo-color-bg-soft);
  border-radius: var(--momo-radius-md); border: 1px solid var(--momo-color-border-light);
}
.fav-btn {
  flex-shrink: 0; cursor: pointer; margin-top: 2px;
  width: 18px; height: 18px;
  color: var(--momo-color-text-placeholder); transition: color 0.2s;
}
.fav-btn:hover { color: var(--momo-color-warning); }
.fav-btn.active { color: var(--momo-color-warning); fill: var(--momo-color-warning); }
.item-main { flex: 1; min-width: 0; }
.item-name { font-weight: 600; font-size: var(--momo-font-size-base); color: var(--momo-color-text); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.struct-badge { flex-shrink: 0; }
.item-content {
  font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); white-space: pre-wrap; word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.item-tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.item-actions { flex-shrink: 0; display: flex; gap: 4px; }

.pagination-wrap { display: flex; justify-content: center; margin-top: 16px; }

.edit-dialog {
  height: 80vh;
  display: flex;
  flex-direction: column;
}
</style>
