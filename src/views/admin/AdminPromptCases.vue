<script setup lang="ts">
/**
 * AdminPromptCases - 提示词参考案例管理页面。
 * 管理员可添加/编辑/删除官方案例图（选字段 + 关键词 + 上传图 + 填 prompt）。
 */
defineOptions({ name: 'AdminPromptCases' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { adminPromptCasesApi } from '@/services/promptCasesApi'
import { ossApi } from '@/services/ossApi'
import { useImagePreview } from '@/composables/useImagePreview'
import { SEGMENT_META } from '@/utils/promptAssembler'
import PageLayout from '@/components/PageLayout.vue'
import { Plus, Pencil, Trash2, Upload, RefreshCw } from '@lucide/vue'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { UiEmptyState, UiImagePreview, UiNumberInput } from '@/components/ui'

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

const { visible: previewVisible, url: previewUrl, open: openPreview } = useImagePreview()

const segmentLabels = SEGMENT_META.map((m) => ({ key: m.key, label: m.label }))

function segmentLabel(key: string): string {
  return SEGMENT_META.find((m) => m.key === key)?.label || key
}

/** 全部字段（视图态：左轨的「全部」项，不对应接口参数） */
const ALL_KEY = '__all__'

// ── 视图派生：左轨计数 + 按字段分组的案例 ──
// 未筛选时接口一次返回全量，左轨的分段计数即为真实值；
// 已筛选时不显示计数，避免用局部数据冒充全局数字。
const segmentCounts = computed<Record<string, number> | null>(() => {
  if (filterSegment.value) return null
  const map: Record<string, number> = {}
  cases.value.forEach((c) => { map[c.segment_key] = (map[c.segment_key] || 0) + 1 })
  return map
})

/** 按 SEGMENT_META 的顺序分组，未知字段名兜底排在末尾 */
const groupedCases = computed<Array<{ key: string; label: string; items: CaseRow[] }>>(() => {
  const buckets = new Map<string, CaseRow[]>()
  cases.value.forEach((c) => {
    const list = buckets.get(c.segment_key) || []
    list.push(c)
    buckets.set(c.segment_key, list)
  })
  const order = [...segmentLabels.map((s) => s.key), ...Array.from(buckets.keys())]
  const seen = new Set<string>()
  const out: Array<{ key: string; label: string; items: CaseRow[] }> = []
  for (const key of order) {
    if (seen.has(key)) continue
    seen.add(key)
    const items = buckets.get(key)
    if (!items?.length) continue
    out.push({ key, label: segmentLabel(key), items })
  }
  return out
})

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

/** 左轨切换字段：语义等价于原来的「字段下拉 + 清除筛选」，少一层控件 */
function selectSegment(key: string) {
  const next = key === ALL_KEY ? '' : key
  if (next === filterSegment.value) return
  filterSegment.value = next
  loadCases()
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
  <PageLayout
    title="提示词案例管理"
    subtitle="官方案例图按字段归档：字段 + 关键词 + 参考图 + 提示词快照。"
    content-padding="0"
  >
    <template #extra>
      <Button @click="openCreate"><Plus />添加案例</Button>
    </template>

    <template #filters>
      <Button variant="ghost" size="sm" class="gap-1.5" @click="loadCases">
        <RefreshCw class="size-3.5" />刷新
      </Button>
      <span v-if="!loading && cases.length" class="text-muted-foreground ml-auto text-xs tabular-nums">
        {{ filterSegment ? segmentLabel(filterSegment) : '全部字段' }} · 本页 {{ cases.length }} 条
      </span>
    </template>

    <div class="flex h-full min-h-0">
      <!-- 左轨：字段即分组，替代原先的下拉筛选 + 独立的清除按钮 -->
      <nav class="w-48 shrink-0 overflow-y-auto border-r bg-background py-2">
        <button
          type="button"
          class="rail-item"
          :class="{ 'is-active': !filterSegment }"
          @click="selectSegment(ALL_KEY)"
        >
          <span class="truncate">全部字段</span>
          <span v-if="segmentCounts" class="rail-count">{{ cases.length }}</span>
        </button>
        <div class="bg-border my-2 h-px" />
        <button
          v-for="s in segmentLabels"
          :key="s.key"
          type="button"
          class="rail-item"
          :class="{ 'is-active': filterSegment === s.key }"
          @click="selectSegment(s.key)"
        >
          <span class="truncate">{{ s.label }}</span>
          <span v-if="segmentCounts" class="rail-count">{{ segmentCounts[s.key] || 0 }}</span>
        </button>
      </nav>

      <!-- 右栏：按字段分组的案例图集，字段名吸顶 -->
      <div class="min-w-0 flex-1 overflow-y-auto">
        <div v-if="loading" class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-4">
          <Skeleton v-for="i in 8" :key="i" class="h-[240px] w-full rounded-md" />
        </div>

        <UiEmptyState v-else-if="!cases.length" :title="filterSegment ? '该字段下还没有案例' : '还没有案例'">
          <Button @click="openCreate"><Plus />添加案例</Button>
        </UiEmptyState>

        <template v-else>
          <section v-for="group in groupedCases" :key="group.key">
          <h3 class="group-head sticky">
            {{ group.label }}
            <span class="text-muted-foreground font-normal tabular-nums">{{ group.items.length }}</span>
          </h3>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pb-5">
            <article v-for="row in group.items" :key="row.id" class="case-card">
              <button
                type="button"
                class="flex aspect-[4/3] w-full cursor-zoom-in items-center justify-center overflow-hidden bg-muted"
                title="查看大图"
                @click="openPreview(row.image_url)"
              >
                <img v-if="row.image_url" :src="row.image_url" class="size-full object-cover" loading="lazy" alt="案例参考图" />
                <span v-else class="text-muted-foreground/60 text-xs">未上传参考图</span>
              </button>

              <div class="p-2.5">
                <div class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium" :title="row.keyword">{{ row.keyword }}</span>
                  <span class="text-muted-foreground/70 ml-auto shrink-0 text-[11px] tabular-nums" title="排序">#{{ row.sort_order }}</span>
                </div>
                <div v-if="row.model" class="text-muted-foreground mt-0.5 truncate text-[11px]">{{ row.model }}</div>

                <div class="mt-2 border-t pt-2">
                  <p
                    v-if="row.prompt_snapshot"
                    class="text-muted-foreground/90 line-clamp-2 min-h-8 text-[11px] leading-snug"
                    :title="row.prompt_snapshot"
                  >{{ row.prompt_snapshot }}</p>
                  <p v-else class="text-muted-foreground/60 min-h-8 text-[11px]">无提示词快照</p>
                </div>

                <div class="-mx-1 -mb-1 flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" class="h-6 gap-1 px-1.5 text-[11px]" @click="openEdit(row)">
                    <Pencil class="size-3" />编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive hover:text-destructive h-6 gap-1 px-1.5 text-[11px]"
                    @click="handleDelete(row)"
                  >
                    <Trash2 class="size-3" />删除
                  </Button>
                </div>
              </div>
            </article>
          </div>
          </section>
        </template>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <Dialog :open="editVisible" @update:open="(v: boolean) => (editVisible = v)">
      <DialogContent class="sm:max-w-lg" @pointer-down-outside.prevent>
        <DialogHeader>
          <DialogTitle>{{ editingCase ? '编辑案例' : '添加案例' }}</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="grid gap-1.5">
            <Label for="case-segment">字段</Label>
            <Select
              :model-value="form.segment_key"
              @update:model-value="(v) => (form.segment_key = String(v))"
            >
              <SelectTrigger id="case-segment" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in segmentLabels" :key="s.key" :value="s.key">
                  {{ s.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-1.5">
            <Label for="case-keyword">关键词</Label>
            <Input id="case-keyword" v-model="form.keyword" placeholder="如：柔光、侧光、逆光" />
          </div>
          <div class="grid gap-1.5">
            <Label>参考图</Label>
            <div class="upload-area">
              <div v-if="form.image_url" class="upload-preview">
                <img :src="form.image_url" alt="预览" />
                <Button variant="outline" size="sm" @click="form.image_url = ''">更换</Button>
              </div>
              <label v-else class="upload-trigger" :class="{ loading: uploading }">
                <Upload class="size-6" />
                <span>{{ uploading ? '上传中...' : '点击上传' }}</span>
                <input type="file" accept="image/*" style="display:none" @change="onFileChange" />
              </label>
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label for="case-prompt">提示词快照（可选）</Label>
            <Textarea id="case-prompt" v-model="form.prompt_snapshot" :rows="3" placeholder="生成该图时的完整提示词（可复现）" />
          </div>
          <div class="grid grid-cols-[2fr_1fr] gap-4">
            <div class="grid gap-1.5">
              <Label for="case-model">模型（可选）</Label>
              <Input id="case-model" v-model="form.model" placeholder="如 gpt-image-2" />
            </div>
            <div class="grid gap-1.5">
              <Label for="case-sort">排序</Label>
              <UiNumberInput id="case-sort" v-model="form.sort_order" :min="0" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editVisible = false">取消</Button>
          <Button @click="handleSave">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
  </PageLayout>
</template>

<style scoped>
/* 左轨条目 */
.rail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  background: none;
  cursor: pointer;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
  text-align: left;
  border-left: 2px solid transparent;
}
.rail-item:hover {
  color: var(--momo-color-text);
  background: var(--momo-color-bg-muted);
}
.rail-item.is-active {
  color: var(--momo-color-text);
  font-weight: var(--momo-font-weight-medium);
  background: var(--momo-color-brand-subtle);
  border-left-color: var(--momo-color-brand);
}
.rail-count {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--momo-font-size-xs);
  font-variant-numeric: tabular-nums;
  color: var(--momo-color-text-tertiary);
}

/* 分组标题：吸顶，滚动时始终知道自己在看哪个字段 */
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin-bottom: 12px;
  font-size: var(--momo-font-size-xs);
  font-weight: var(--momo-font-weight-medium);
  letter-spacing: 0.04em;
  color: var(--momo-color-text-secondary);
  background: var(--momo-color-bg-page);
  border-bottom: 1px solid var(--momo-color-border-soft);
}
.group-head.sticky {
  top: 0;
  z-index: 1;
}

/* 案例卡片：图在上、信息在下，一条发丝线分组，不加阴影 */
.case-card {
  border: 1px solid var(--momo-color-border-soft);
  border-radius: var(--momo-radius-md);
  background: var(--momo-color-bg);
  overflow: hidden;
  transition: border-color 0.15s;
}
.case-card:hover {
  border-color: var(--momo-color-border);
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
  border: 1px solid var(--momo-color-border-soft);
}
.upload-trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100px;
  height: 100px;
  border: 2px dashed var(--momo-color-border);
  border-radius: var(--momo-radius-sm);
  cursor: pointer;
  color: var(--momo-color-text-secondary);
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
