<script setup lang="ts">
defineOptions({ name: 'AdminPhotography' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error } = useUiFeedback()
import { Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, LoaderCircle } from '@lucide/vue'
import { photographyApi } from '@/services/photographyApi'
import type { PhotographyElement, PhotographyElementPrompt } from '@/services/photographyApi'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import PageLayout from '@/components/PageLayout.vue'
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
import { Textarea } from '@/components/ui/textarea'
import { UiEmptyState, UiNumberInput } from '@/components/ui'

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

const modelCatalog = useModelCatalogStore()

function modelDisplayName(modelId: string): string {
  return modelCatalog.displayNameFor(modelId)
}

/** 展示用：某个元素下未保存的提示词条数（保存按钮的可用性 + 头部脏标记都读它） */
function dirtyCountOf(el: ElementWithPrompts): number {
  return el.prompts.reduce((n, p) => n + (p._dirty ? 1 : 0), 0)
}

const dirtyTotal = computed(() => elements.value.reduce((n, el) => n + dirtyCountOf(el), 0))

/** 保存中的元素 id：仅用于把 spinner 精确画到那一行的保存按钮上（纯视图态） */
const savingElementId = ref<number | null>(null)

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
  savingElementId.value = el.id
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
  savingElementId.value = null
  if (ok > 0) success(`已保存 ${ok} 条`)
}

onMounted(() => load())
</script>

<template>
  <PageLayout
    title="AI摄影配置"
    subtitle="为每个元素设置各模型下的系统提示词。生成时系统按元素顺序拼接提示词，并自动附加参考图映射说明。"
  >
    <template #extra>
      <Button @click="openCreateDialog"><Plus />新增元素</Button>
    </template>

    <template #filters>
      <Button variant="ghost" size="sm" @click="toggleAll">
        {{ allExpanded ? '全部折叠' : '全部展开' }}
      </Button>
      <span v-if="!loading && elements.length" class="text-muted-foreground ml-auto text-xs tabular-nums">
        <span v-if="dirtyTotal > 0" class="text-warning font-medium">未保存 {{ dirtyTotal }} 处 · </span>
        共 {{ elements.length }} 个元素
      </span>
    </template>

    <div v-if="loading" class="flex flex-col gap-3">
      <Skeleton v-for="i in 4" :key="i" class="h-12 w-full" />
    </div>

    <UiEmptyState v-else-if="elements.length === 0" title="暂无元素，请点击「新增元素」添加">
      <Button @click="openCreateDialog"><Plus />新增元素</Button>
    </UiEmptyState>

    <!-- 元素列表：贴页面灰底，用发丝线分行；每行的表头吸顶，动作与保存常驻可见 -->
    <div v-else class="elements-list">
      <div
        v-for="(el, ei) in elements"
        :key="el.id"
        class="element"
        :class="{ inactive: el.status !== 'active' }"
      >
        <div class="element-head">
          <button
            type="button"
            class="element-title"
            :aria-expanded="expandedElements.has(el.id)"
            @click="toggleElement(el.id)"
          >
            <ChevronDown class="chevron" :class="{ rotated: expandedElements.has(el.id) }" />
            <span class="element-label">{{ el.label }}</span>
            <Badge v-if="el.status !== 'active'" variant="secondary">已禁用</Badge>
            <Badge v-if="dirtyCountOf(el) > 0" variant="warning">{{ dirtyCountOf(el) }} 处未保存</Badge>
            <span class="element-meta">
              标识 {{ el.name }} · 最多 {{ el.max_images }} 张图 · {{ el.prompts.length }} 个模型
            </span>
          </button>

          <div class="element-actions" @click.stop>
            <Button variant="ghost" size="icon-sm" :disabled="ei === 0" title="上移" @click="handleMoveUp(el, ei)">
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              :disabled="ei === elements.length - 1"
              title="下移"
              @click="handleMoveDown(el, ei)"
            >
              <ArrowDown />
            </Button>
            <Button variant="ghost" size="sm" @click="openEditDialog(el)">编辑</Button>
            <Button variant="ghost" size="sm" @click="handleToggleStatus(el)">
              {{ el.status === 'active' ? '禁用' : '启用' }}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-destructive hover:text-destructive"
              title="删除"
              @click="handleDelete(el)"
            >
              <Trash2 />
            </Button>
            <Button
              size="sm"
              :disabled="saving || dirtyCountOf(el) === 0"
              @click="saveElementPrompts(el)"
            >
              <LoaderCircle v-if="saving && savingElementId === el.id" class="animate-spin" />
              保存
            </Button>
          </div>
        </div>

        <div v-show="expandedElements.has(el.id)" class="element-body">
          <p v-if="!el.prompts.length" class="text-muted-foreground text-sm">该元素还没有模型提示词</p>
          <div v-for="prompt in el.prompts" :key="prompt.id" class="prompt-row">
            <div class="prompt-model">
              <span class="truncate">{{ modelDisplayName(prompt.model_id) }}</span>
              <span v-if="prompt._dirty" class="dirty-dot" title="未保存" />
            </div>
            <Textarea
              v-model="prompt.system_prompt"
              :rows="3"
              class="resize-y"
              placeholder="该元素的系统提示词（可为空）"
              @input="markDirty(prompt)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <Dialog :open="dialogVisible" @update:open="(v: boolean) => { dialogVisible = v; if (!v) editingId = null }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ dialogTitle }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label for="element-name">元素标识</Label>
            <Input id="element-name" v-model="dialogForm.name" placeholder="英文标识，如 face、pose" />
          </div>
          <div class="grid gap-1.5">
            <Label for="element-label">显示标签</Label>
            <Input id="element-label" v-model="dialogForm.label" placeholder="中文标签，如 人脸、姿势" />
          </div>
          <div class="grid gap-1.5">
            <Label for="element-max-images">最大图片数</Label>
            <UiNumberInput id="element-max-images" v-model="dialogForm.max_images" :min="1" :max="10" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="dialogVisible = false">取消</Button>
          <Button @click="handleDialogConfirm">确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageLayout>
</template>

<style scoped>
.elements-list {
  display: flex;
  flex-direction: column;
  /* 分行靠发丝线而不是靠卡片：一屏能多看两三个元素 */
  border-top: 1px solid var(--momo-color-border-soft);
}

.element {
  border-bottom: 1px solid var(--momo-color-border-soft);
}
.element.inactive {
  opacity: 0.62;
}

/* 吸顶表头：滚动到某个元素的长提示词里时，它的名字 / 动作 / 保存按钮不会滚走 */
.element-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  background: var(--momo-color-bg-page);
  border-bottom: 1px solid transparent;
}
.element-head:focus-within,
.element:hover > .element-head {
  border-bottom-color: var(--momo-color-border-soft);
}

.element-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--momo-color-text-secondary);
  transition: transform 0.2s;
}
.chevron.rotated {
  transform: rotate(180deg);
}

.element-label {
  font-size: var(--momo-font-size-base);
  font-weight: var(--momo-font-weight-semibold);
  color: var(--momo-color-text);
  white-space: nowrap;
}

.element-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.element-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 提示词正文：模型名固定一列，与输入框左对齐成两栏，扫读时视线不用跳 */
.element-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0 16px;
}

.prompt-row {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.prompt-model {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding-top: 8px;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
}

.dirty-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--momo-color-warning);
}

@media (max-width: 900px) {
  .prompt-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .prompt-model {
    padding-top: 0;
  }
  .element-head {
    flex-wrap: wrap;
  }
}
</style>
