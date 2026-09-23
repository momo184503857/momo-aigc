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
import { Search, RefreshCw, Trash2, Plus, Upload, X, Tags } from '@lucide/vue'
import { useImagePreview } from '@/composables/useImagePreview'
import { ossApi } from '@/services/ossApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UiEmptyState, UiImagePreview, UiPagination } from '@/components/ui'

const { success, warning, error, confirmDanger } = useUiFeedback()

const works = ref<WorkItem[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const filterStatus = ref('')
const keyword = ref('')

// reka SelectItem 不接受空字符串 value，用哨兵值表示「全部」（替代原 clearable）
const ALL_STATUS = '__all__'

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
const tagsVisible = ref(false)

const { visible: previewVisible, url: previewUrl, open: openPreview } = useImagePreview()

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

// TODO(multiple-select): 原多选下拉标签选择，改为 Checkbox 组（标签数量少，语义等价）
function toggleTag(id: number, checked: boolean) {
  const list = officialForm.value.tagIds
  const idx = list.indexOf(id)
  if (checked && idx === -1) list.push(id)
  else if (!checked && idx !== -1) list.splice(idx, 1)
}

onMounted(() => {
  loadWorks()
  loadTags()
})
</script>

<template>
  <PageLayout title="作品库管理" content-padding="0">
    <template #extra>
      <Button variant="outline" @click="tagsVisible = true"><Tags />标签管理</Button>
      <Button @click="openOfficial"><Plus />发布官方作品</Button>
    </template>

    <template #filters>
      <div class="relative w-64">
        <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          v-model="keyword"
          placeholder="搜索提示词"
          class="pr-7 pl-8"
          @keyup.enter="() => { page = 1; loadWorks() }"
        />
        <button
          v-if="keyword"
          type="button"
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
          title="清除"
          @click="() => { keyword = ''; page = 1; loadWorks() }"
        >
          <X class="size-3.5" />
        </button>
      </div>
      <Select
        :model-value="filterStatus || ALL_STATUS"
        @update:model-value="(v) => { filterStatus = String(v) === ALL_STATUS ? '' : String(v); page = 1; loadWorks() }"
      >
        <SelectTrigger class="w-30">
          <SelectValue placeholder="全部状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="ALL_STATUS">全部状态</SelectItem>
          <SelectItem value="published">已发布</SelectItem>
          <SelectItem value="hidden">已下架</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" class="gap-1.5" @click="loadWorks">
        <RefreshCw class="size-3.5" />刷新
      </Button>
      <span v-if="works.length" class="text-muted-foreground ml-auto text-xs tabular-nums">
        本页 {{ works.length }} / 共 {{ total }} 条
      </span>
    </template>

    <!-- 作品表格：主体唯一的滚动区域，表头与操作列吸边 -->
    <div class="h-full min-h-0">
      <Table sticky-header sticky-last-column max-height="100%">
        <TableHeader>
          <TableRow>
            <TableHead>作品</TableHead>
            <TableHead class="w-[100px]">模式</TableHead>
            <TableHead class="w-[140px]">模型</TableHead>
            <TableHead class="w-[100px]">作者</TableHead>
            <TableHead class="w-[120px]">互动</TableHead>
            <TableHead class="w-[90px]">状态</TableHead>
            <TableHead class="w-[150px]">发布时间</TableHead>
            <TableHead class="w-[140px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="i">
              <TableCell :colspan="8"><Skeleton class="h-8 w-full" /></TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow v-for="row in works" :key="row.id">
              <TableCell>
                <div class="work-cell">
                  <button
                    v-if="row.image_url"
                    type="button"
                    class="cursor-zoom-in rounded-sm"
                    title="查看大图"
                    @click="openPreview(row.image_url)"
                  >
                    <img :src="row.image_url" class="work-thumb" alt="作品缩略图" />
                  </button>
                  <div class="work-cell-info">
                    <div class="work-cell-title">
                      <span class="text-muted-foreground font-normal tabular-nums">#{{ row.id }}</span>
                      <Badge v-if="row.is_official" variant="warning">官方</Badge>
                    </div>
                    <div class="work-cell-prompt" :title="row.prompt">{{ row.prompt?.slice(0, 60) }}{{ row.prompt?.length > 60 ? '...' : '' }}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>{{ getFeatureLabel(row.feature_id || 'free-gen') }}</TableCell>
              <TableCell>{{ modelDisplayName(row.model) }}</TableCell>
              <TableCell>{{ row.author?.nickname || row.author?.username || '-' }}</TableCell>
              <TableCell>
                <span class="stat">赞{{ row.like_count }}</span>
                <span class="stat">藏{{ row.favorite_count }}</span>
                <span class="stat">用{{ row.reuse_count }}</span>
              </TableCell>
              <TableCell>
                <Badge :variant="row.status === 'published' ? 'success' : 'secondary'">
                  {{ row.status === 'published' ? '已发布' : '已下架' }}
                </Badge>
              </TableCell>
              <TableCell>{{ toBJMinute(row.created_at) }}</TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    v-if="row.status === 'published'"
                    variant="ghost"
                    size="sm"
                    @click="handleStatusChange(row, 'hidden')"
                  >下架</Button>
                  <Button
                    v-else
                    size="sm"
                    @click="handleStatusChange(row, 'published')"
                  >上架</Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="删除"
                    class="text-destructive hover:text-destructive"
                    @click="handleDelete(row)"
                  ><Trash2 /></Button>
                </div>
              </TableCell>
            </TableRow>
            <TableEmpty v-if="!works.length" :colspan="8">
              <UiEmptyState title="暂无数据" />
            </TableEmpty>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- 标签管理：低频维护动作，收进弹窗，不再挤占作品列表的滚动流 -->
    <Dialog :open="tagsVisible" @update:open="(v: boolean) => (tagsVisible = v)">
      <DialogContent class="sm:max-w-lg" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>标签管理</DialogTitle>
        </DialogHeader>
        <div class="tags-input-row">
          <Input v-model="newTagName" placeholder="输入标签名" class="flex-1" @keyup.enter="handleCreateTag" />
          <Button @click="handleCreateTag"><Plus />添加</Button>
        </div>
        <div class="tags-list max-h-[45vh] overflow-y-auto">
          <Badge v-for="t in tags" :key="t.id" variant="secondary" class="tag-item">
            {{ t.name }} ({{ t.usage_count }})
            <button
              class="text-muted-foreground hover:text-destructive ml-1 inline-flex cursor-pointer"
              title="删除标签"
              @click="handleDeleteTag(t.id)"
            ><X class="size-3" /></button>
          </Badge>
          <p v-if="!tags.length" class="text-muted-foreground text-sm">还没有标签</p>
        </div>
      </DialogContent>
    </Dialog>

    <template #footer>
      <UiPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :show-size-selector="false"
        @current-change="handlePageChange"
      />
    </template>

    <!-- 官方作品发布弹窗 -->
    <Dialog :open="officialVisible" @update:open="(v: boolean) => (officialVisible = v)">
      <DialogContent class="sm:max-w-2xl" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>发布官方作品</DialogTitle>
        </DialogHeader>
        <div class="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div class="grid gap-1.5">
            <Label>作品图片</Label>
            <div class="upload-area">
              <div v-if="officialForm.image_url" class="upload-preview">
                <img :src="officialForm.image_url" alt="预览" />
                <Button variant="outline" size="sm" @click="officialForm.image_url = ''">更换</Button>
              </div>
              <label v-else class="upload-trigger" :class="{ loading: uploadingImage }">
                <Upload class="size-6" />
                <span>{{ uploadingImage ? '上传中...' : '点击上传图片' }}</span>
                <input type="file" accept="image/*" class="hidden" @change="onFileChange" />
              </label>
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label for="official-prompt">提示词</Label>
            <Textarea id="official-prompt" v-model="officialForm.prompt" :rows="4" placeholder="完整提示词" />
          </div>
          <div class="grid gap-1.5">
            <Label for="official-negative">负向规避词（可选）</Label>
            <Textarea id="official-negative" v-model="officialForm.negative_prompt" :rows="2" placeholder="如：模糊、低质量、多余手指" />
          </div>
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div class="grid gap-1.5">
              <Label>模式</Label>
              <Select
                :model-value="officialForm.feature_id"
                @update:model-value="(v) => (officialForm.feature_id = String(v))"
              >
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="f in featureOptions" :key="f.id" :value="f.id">{{ f.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-1.5">
              <Label>模型</Label>
              <Select
                :model-value="officialForm.model"
                @update:model-value="(v) => (officialForm.model = String(v))"
              >
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in modelCatalog.flatImageModels" :key="m.id" :value="m.modelId">
                    {{ m.displayName }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-1.5">
              <Label for="official-resolution">分辨率</Label>
              <Input id="official-resolution" v-model="officialForm.resolution" />
            </div>
            <div class="grid gap-1.5">
              <Label for="official-ratio">宽高比</Label>
              <Input id="official-ratio" v-model="officialForm.aspect_ratio" />
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label>标签（可选）</Label>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              <div v-for="t in tags" :key="t.id" class="flex items-center gap-1.5">
                <Checkbox
                  :id="`official-tag-${t.id}`"
                  :model-value="officialForm.tagIds.includes(t.id)"
                  @update:model-value="(v) => toggleTag(t.id, v === true)"
                />
                <Label :for="`official-tag-${t.id}`" class="font-normal">{{ t.name }}</Label>
              </div>
              <span v-if="!tags.length" class="text-muted-foreground text-xs">暂无标签</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="officialVisible = false">取消</Button>
          <Button @click="handlePublishOfficial">发布</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
  </PageLayout>
</template>

<style scoped>
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
  color: var(--momo-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.stat {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-secondary);
  margin-right: 6px;
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
  border: 1px solid var(--border);
}
.upload-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100px;
  height: 100px;
  border: 2px dashed var(--border);
  border-radius: var(--momo-radius-sm);
  cursor: pointer;
  color: var(--momo-color-text-secondary);
  transition: border-color 0.2s, color 0.2s;
}
.upload-trigger:hover {
  border-color: var(--momo-color-brand);
  color: var(--momo-color-brand);
}
.upload-trigger.loading {
  opacity: 0.6;
  pointer-events: none;
}
</style>
