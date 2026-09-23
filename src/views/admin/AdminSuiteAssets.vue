<template>
  <PageLayout
    title="成套生图资产管理"
    subtitle="管理员维护全局资产（全员可用）：主题库 / 模特人设 / 锁定模板 / 服装特征 / 拆解知识"
    content-padding="0"
    :show-footer="!!selectedRow"
  >
    <template #extra>
      <Button @click="openCreate"><Plus /> 新建{{ currentTab.label }}</Button>
    </template>

    <!-- 资产类型 + 关键词：属于「在看什么」的外壳，常驻表头带，不随表格滚动 -->
    <template #filters>
      <Tabs :model-value="activeType" @update:model-value="(v) => { activeType = String(v) as SgAssetType; load() }">
        <TabsList>
          <TabsTrigger v-for="t in TYPE_TABS" :key="t.type" :value="t.type">{{ t.label }}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div class="relative w-56">
        <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          v-model="keyword"
          placeholder="搜索名称/关键词…"
          class="h-8 pl-8 pr-7 text-[13px]"
          @keyup.enter="load"
        />
        <button
          v-if="keyword"
          type="button"
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
          title="清除"
          @click="keyword = ''; load()"
        >
          <X class="size-3.5" />
        </button>
      </div>
      <Button variant="ghost" size="sm" class="gap-1.5" @click="load">
        <RefreshCw class="size-3.5" />刷新
      </Button>
      <span v-if="!loading && rows.length" class="text-muted-foreground ml-auto text-xs tabular-nums">
        本页 {{ rows.length }} 条
      </span>
    </template>

    <!-- 资产表：整页唯一滚动区，表头与操作列吸边 -->
    <div class="table-host h-full min-h-0">
      <Table sticky-header sticky-last-column max-height="100%">
        <TableHeader>
          <TableRow>
            <TableHead class="w-16">ID</TableHead>
            <TableHead class="w-20">归属</TableHead>
            <TableHead
              v-for="col in currentTab.columns"
              :key="col.key"
              :style="col.width ? { width: col.width + 'px' } : undefined"
            >
              {{ col.label }}
            </TableHead>
            <TableHead class="w-18">
              <button
                class="inline-flex items-center gap-1"
                @click="toggleHotSort('use_count')"
              >
                热度
                <component
                  :is="hotSortField === 'use_count' ? (hotSortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown"
                  class="size-3.5"
                  :class="hotSortField === 'use_count' ? 'text-primary' : 'text-muted-foreground/50'"
                />
              </button>
            </TableHead>
            <TableHead class="w-20">状态</TableHead>
            <TableHead class="w-44 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="loading">
            <TableRow v-for="i in 6" :key="i">
              <TableCell :colspan="currentTab.columns.length + 5"><Skeleton class="h-8 w-full" /></TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow
              v-for="row in sortedRows"
              :key="row.id"
              :data-state="selectedRow?.id === row.id ? 'selected' : undefined"
              class="cursor-pointer"
              @click="selectedRow = row"
            >
              <TableCell class="text-muted-foreground tabular-nums">{{ row.id }}</TableCell>
              <TableCell>
                <Badge :variant="row.isGlobal ? 'default' : 'success'">{{ row.isGlobal ? '全局' : '私有' }}</Badge>
              </TableCell>
              <TableCell v-for="col in currentTab.columns" :key="col.key">
                <template v-if="col.type === 'images'">
                  <!-- 组图：把整个数组交给预览器，遮罩内可 ←/→ 翻页 -->
                  <button
                    v-if="(row[col.key] || []).length"
                    type="button"
                    class="images-cell cursor-zoom-in"
                    :title="`查看组图（${row[col.key].length} 张）`"
                    @click.stop="preview.open(row[col.key])"
                  >
                    <img :src="row[col.key][0]" class="col-thumb" alt="" />
                    <span class="col-muted text-[11px] tabular-nums">{{ row[col.key].length }}张</span>
                  </button>
                  <span v-else class="col-muted">—</span>
                </template>
                <span
                  v-else-if="col.render"
                  class="block max-w-80 truncate"
                  :title="col.render(row)"
                >{{ col.render(row) }}</span>
                <span v-else-if="Array.isArray(row[col.key])">{{ (row[col.key] as any[]).length }} 项</span>
                <span v-else class="block max-w-80 truncate" :title="String(row[col.key] ?? '')">{{ row[col.key] }}</span>
              </TableCell>
              <TableCell class="tabular-nums">{{ row.use_count }}</TableCell>
              <TableCell>
                <Badge :variant="row.status === 'active' ? 'success' : 'secondary'">
                  {{ row.status === 'active' ? '启用' : '停用' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-1" @click.stop>
                  <Button variant="outline" size="sm" @click="openEdit(row)">编辑</Button>
                  <Button variant="ghost" size="sm" @click="toggleStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</Button>
                  <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="removeRow(row)">删除</Button>
                </div>
              </TableCell>
            </TableRow>
            <TableEmpty v-if="!rows.length" :colspan="currentTab.columns.length + 5">
              <UiEmptyState :title="`暂无${currentTab.label}资产`">
                <Button @click="openCreate"><Plus /> 新建{{ currentTab.label }}</Button>
              </UiEmptyState>
            </TableEmpty>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- 选中行才出现的动作栏：低频的「发布为官方提示词卡片」收在这里，不再常驻工具条占位 -->
    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-muted-foreground text-xs tabular-nums">
          已选中 {{ currentTab.label }}
          <span class="text-foreground font-medium">#{{ selectedRow?.id }}</span>
          <span class="max-w-60 truncate align-bottom inline-block">{{ describeRow(selectedRow) }}</span>
        </p>
        <div class="flex items-center gap-2">
          <Button
            v-if="activeType === 'lock-templates'"
            variant="outline"
            size="sm"
            @click="publishCard"
          >发布为官方提示词卡片</Button>
          <Button variant="ghost" size="sm" @click="selectedRow = null">取消选择</Button>
        </div>
      </div>
    </template>

    <!-- 编辑弹窗 -->
    <Dialog :open="editVisible" @update:open="(v: boolean) => (editVisible = v)">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ (editingId ? '编辑' : '新建') + currentTab.label }}</DialogTitle>
        </DialogHeader>
        <div class="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
          <div
            v-for="f in currentTab.fields"
            :key="f.key"
            class="grid gap-1.5"
          >
            <Label>
              {{ f.label }}
              <span v-if="currentTab.required.includes(f.key)" class="text-destructive">*</span>
            </Label>
            <MultiImageUpload
              v-if="f.images"
              v-model="editForm[f.key]"
              :max="f.max || 5"
              :sortable="f.sortable || false"
              :caption-prefix="f.captionPrefix"
            />
            <div v-else-if="f.pointDetails" class="points-block">
              <div class="points-toolbar">
                <Button variant="outline" size="sm" @click="openThemeJson">JSON 导入</Button>
                <span class="points-tip">粘贴整包 JSON（套图名字 + 提示词列表），确认后一键填充本弹窗</span>
              </div>
              <PointDetailsField :key="editingId ?? 'new'" v-model="editForm[f.key]" />
            </div>
            <!-- TODO(multiple-select): 多选下拉用 Popover + Checkbox 列表实现 -->
            <Popover v-else-if="f.options && f.multiple">
              <PopoverTrigger as-child>
                <Button variant="outline" class="w-full justify-between font-normal">
                  <span class="truncate">
                    {{ (editForm[f.key] || []).length ? (editForm[f.key] || []).join('、') : '请选择' }}
                  </span>
                  <ChevronDown class="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-56 p-2" align="start">
                <label
                  v-for="o in f.options"
                  :key="o"
                  class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <Checkbox
                    :model-value="(editForm[f.key] || []).includes(o)"
                    @update:model-value="(v) => toggleMultiValue(f.key, o, v === true)"
                  />
                  {{ o }}
                </label>
              </PopoverContent>
            </Popover>
            <Select
              v-else-if="f.options"
              :model-value="String(editForm[f.key] ?? '')"
              @update:model-value="(v) => (editForm[f.key] = String(v))"
            >
              <SelectTrigger class="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="o in f.options" :key="o" :value="o">{{ o }}</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              v-else-if="f.textarea"
              v-model="editForm[f.key]"
              :rows="f.rows || 4"
              :placeholder="f.placeholder"
            />
            <Input v-else v-model="editForm[f.key]" :placeholder="f.placeholder" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="editVisible = false">取消</Button>
          <Button :disabled="saving" @click="save">
            <LoaderCircle v-if="saving" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 主题库 JSON 导入弹窗：套图名字 + 提示词列表（中文字段名），确认后填充到新建/编辑弹窗 -->
    <Dialog :open="themeJsonVisible" @update:open="(v: boolean) => (themeJsonVisible = v)">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>JSON 导入 · 主题库</DialogTitle>
        </DialogHeader>
        <div class="json-tip">
          格式：顶层为「套图名字」+「提示词列表」，每个点位含 名字 / 场景 / 姿势 / 构图 四个字段。
          确认后填充到表单（名称 + 点位四字段，超过 5 个点位自动截取前 5 个），
          点位路径自动按「点位1名 → 点位2名 → …」生成。
        </div>
        <Textarea
          v-model="themeJsonText"
          :rows="16"
          class="json-input"
          spellcheck="false"
          placeholder='{"套图名字":"灰墙棚拍","提示词列表":[{"名字":"坐姿","场景":"…","姿势":"…","构图":"…"}]}'
        />
        <div v-if="themeJsonError" class="json-error">{{ themeJsonError }}</div>
        <DialogFooter>
          <Button variant="outline" @click="themeJsonVisible = false">取消</Button>
          <Button @click="applyThemeJson">确认填充</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <UiImagePreview v-model="preview.visible.value" :url="preview.url.value" />
  </PageLayout>
</template>

<script setup lang="ts">
/**
 * AdminSuiteAssets — 成套生图资产管理（全局资产 CRUD）。
 * 五类资产走统一工厂路由（/api/admin/sg/:type），本页只做表格 + 弹窗的配置化渲染。
 */
defineOptions({ name: 'AdminSuiteAssets' })
import { computed, onMounted, ref } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import MultiImageUpload from '@/components/admin/MultiImageUpload.vue'
import PointDetailsField from '@/components/PointDetailsField.vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImagePreview } from '@/composables/useImagePreview'
import { useClientSort } from '@/composables/useClientSort'
import { sgApi, type SgAssetType } from '@/services/sgApi'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, LoaderCircle, Plus, RefreshCw, Search, X } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { UiEmptyState, UiImagePreview } from '@/components/ui'

const ui = useUiFeedback()
const preview = useImagePreview()

interface FieldDef {
  key: string
  label: string
  placeholder?: string
  textarea?: boolean
  rows?: number
  options?: string[]
  /** 多选下拉（值为数组） */
  multiple?: boolean
  /** 多图上传（值为 URL 数组） */
  images?: boolean
  /** images 上限 */
  max?: number
  /** 图片可拖拽排序（顺序即点位顺序） */
  sortable?: boolean
  /** 图片下方序号说明前缀（如「点位」→ 点位1/点位2…） */
  captionPrefix?: string
  /** 点位编辑器（固定 5 点位 Tab，四字段；值为 point_details 数组，管理端上方附「JSON 导入」按钮） */
  pointDetails?: boolean
}

interface TypeTab {
  type: SgAssetType
  label: string
  columns: Array<{
    key: string
    label: string
    width?: number
    render?: (row: any) => string
    /** 图片列：首图缩略 + 张数 */
    type?: 'images'
  }>
  fields: FieldDef[]
  required: string[]
}

/** 主题库 · 适合风格选项 */
const THEME_STYLES = [
  '新中式国风', '文艺风', '休闲', '极简', '法式', '度假',
  '优雅', '职场', '运动', '喜婆婆', '小香风',
]

/** 兼容历史旧值（ss/aw/all）的季节展示 */
const SEASON_LEGACY: Record<string, string> = { ss: '春、夏', aw: '秋、冬', all: '全季' }
function seasonText(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join('、') : '全季'
  return SEASON_LEGACY[String(v)] || String(v || '全季')
}
function arrayText(v: unknown): string {
  return Array.isArray(v) ? v.join('、') : String(v ?? '')
}

const TYPE_TABS: TypeTab[] = [
  {
    type: 'themes', label: '主题库',
    columns: [
      { key: 'name', label: '名称', width: 160 },
      { key: 'season', label: '季节', width: 90, render: (row) => seasonText(row.season) },
      { key: 'styles', label: '适合风格', width: 150, render: (row) => arrayText(row.styles) || '—' },
      { key: 'point_details', label: '点位详情' },
      { key: 'path', label: '点位路径' },
      { key: 'images', label: '图片', width: 100, type: 'images' },
    ],
    fields: [
      { key: 'name', label: '名称', placeholder: '如：中式园林庭院' },
      { key: 'season', label: '季节', options: ['春', '夏', '秋', '冬'], multiple: true },
      { key: 'styles', label: '适合风格', options: THEME_STYLES, multiple: true },
      { key: 'path', label: '点位路径', placeholder: '院外 → 中庭 → 池塘边 → 廊桥 → 茶室' },
      { key: 'point_details', label: '点位四字段', pointDetails: true },
      { key: 'images', label: '图片', images: true, max: 5, sortable: true, captionPrefix: '点位' },
    ],
    required: ['name'],
  },
  {
    type: 'personas', label: '模特人设',
    columns: [
      { key: 'name', label: '名称', width: 120 },
      { key: 'dna', label: 'DNA 描述' },
      { key: 'fingerprint', label: '指纹图' },
    ],
    fields: [
      { key: 'name', label: '名称' },
      { key: 'avatar_url', label: '头像 URL（OSS）' },
      { key: 'dna', label: 'DNA 描述', textarea: true, rows: 6, placeholder: '每行一项：面部/肤色/体态/发型/年龄气质' },
      { key: 'hair_default', label: '默认发型妆造', textarea: true, rows: 2 },
      { key: 'fingerprint', label: '指纹图 URL', textarea: true, rows: 4, placeholder: 'JSON 数组，如 ["https://oss.../1.jpg"]' },
    ],
    required: ['name'],
  },
  {
    type: 'lock-templates', label: '锁定模板',
    columns: [
      { key: 'key', label: 'Key', width: 150 },
      { key: 'name', label: '名称', width: 130 },
      { key: 'grp', label: '分组', width: 80 },
      { key: 'order_no', label: '排序', width: 60 },
      { key: 'content', label: '内容' },
    ],
    fields: [
      { key: 'key', label: '模板键', placeholder: '如 neg.hand' },
      { key: 'name', label: '名称' },
      { key: 'grp', label: '分组', options: ['identity', 'garment', 'scene', 'light', 'pose', 'camera', 'quality', 'negative', 'fusion', 'fidelity'] },
      { key: 'order_no', label: '排序（≥1000 为点位差异）' },
      { key: 'content', label: '内容', textarea: true, rows: 8, placeholder: '支持 {{persona.dna}} {{theme.point}} 等占位符' },
      { key: 'cond_kind', label: '启用条件', options: ['none', 'outdoor', 'fingerprint', 'refimg'] },
      { key: 'models', label: '适用模型 JSON', placeholder: '[] 为全部，如 ["gpt-image-2"]' },
      { key: 'scope', label: '适用功能 JSON', placeholder: '["suite"] / ["fusion","swap"]' },
    ],
    required: ['key', 'name', 'grp', 'content'],
  },
  {
    type: 'garment-features', label: '服装特征',
    columns: [
      { key: 'grp', label: '分组', width: 90 },
      { key: 'name', label: '名称', width: 120 },
      { key: 'match_tags', label: '匹配关键词' },
    ],
    fields: [
      { key: 'grp', label: '分组', options: ['style', 'shape', 'fabric', 'element', 'acc'] },
      { key: 'name', label: '名称' },
      { key: 'match_tags', label: '匹配关键词 JSON', placeholder: '["新中式","国风"]' },
      { key: 'detail_hint', label: '四层预填建议', textarea: true, rows: 2 },
    ],
    required: ['grp', 'name'],
  },
  {
    type: 'knowledge', label: '拆解知识',
    columns: [
      { key: 'kind', label: '类别', width: 120 },
      { key: 'field', label: '字段', width: 140 },
      { key: 'content', label: '内容' },
    ],
    fields: [
      { key: 'kind', label: '类别', options: ['field_options', 'reason_rule', 'match_rule'] },
      { key: 'field', label: '字段/键', placeholder: 'scene / props / rule_1 / tag_affinity' },
      { key: 'content', label: '内容 JSON', textarea: true, rows: 8 },
    ],
    required: ['kind', 'field', 'content'],
  },
]

const activeType = ref<SgAssetType>('themes')
const keyword = ref('')
const rows = ref<any[]>([])
const loading = ref(false)
const selectedRow = ref<any>(null)

const currentTab = computed(() => TYPE_TABS.find((t) => t.type === activeType.value) || TYPE_TABS[0])

/** 动作栏里对被选中行的一句话描述：取该类型的名称列（无名称列则取第一列），复用列自带的 render */
function describeRow(row: any): string {
  if (!row) return ''
  const cols = currentTab.value.columns
  const col = cols.find((c) => c.key === 'name') || cols[0]
  if (!col) return ''
  const text = col.render ? col.render(row) : row[col.key]
  return text == null ? '' : String(text)
}

// 热度列排序：沿用旧表格的客户端排序（列表一次拉取 100 条，无后端排序参数）
const {
  sortField: hotSortField,
  sortOrder: hotSortOrder,
  handleSort: toggleHotSort,
  sorted: sortedRows,
} = useClientSort(() => rows.value)

const editVisible = ref(false)
const editingId = ref<number | null>(null)
const editForm = ref<Record<string, any>>({})
const saving = ref(false)

async function load() {
  loading.value = true
  selectedRow.value = null
  try {
    const res = await sgApi.listAssets<any>(activeType.value, {
      scope: 'all', keyword: keyword.value || undefined, pageSize: 100,
    })
    rows.value = res.data.data.records
  } catch (e) {
    ui.error(e, '加载资产失败')
  } finally {
    loading.value = false
  }
}

/** 数组类字段（多选/图片/点位结构化编辑）在表单中保持数组，其余按文本编辑 */
function isArrayField(f: FieldDef): boolean {
  return Boolean(f.multiple || f.images || f.pointDetails)
}

/** 多选字段勾选切换（Popover + Checkbox 实现，值保持数组） */
function toggleMultiValue(key: string, option: string, checked: boolean) {
  const list: any[] = Array.isArray(editForm.value[key]) ? [...editForm.value[key]] : []
  const idx = list.indexOf(option)
  if (checked && idx < 0) list.push(option)
  if (!checked && idx >= 0) list.splice(idx, 1)
  editForm.value[key] = list
}

function openCreate() {
  editingId.value = null
  const form: Record<string, any> = {}
  for (const f of currentTab.value.fields) {
    form[f.key] = isArrayField(f) ? [] : ''
  }
  editForm.value = form
  editVisible.value = true
}

function openEdit(row: any) {
  editingId.value = row.id
  const form: Record<string, any> = {}
  for (const f of currentTab.value.fields) {
    const v = row[f.key]
    if (isArrayField(f)) {
      form[f.key] = Array.isArray(v) ? v : []
    } else {
      form[f.key] = Array.isArray(v) ? JSON.stringify(v) : v ?? ''
    }
  }
  editForm.value = form
  editVisible.value = true
}

// ── 主题库 JSON 导入（套图名字 + 提示词列表，点位字段用中文名） ──
const THEME_POINT_LIMIT = 5
const themeJsonVisible = ref(false)
const themeJsonText = ref('')
const themeJsonError = ref('')

/** 打开 JSON 弹窗时按目标格式预填当前表单值（名称 + 点位），便于增量编辑 */
function openThemeJson() {
  const src = Array.isArray(editForm.value.point_details) ? editForm.value.point_details : []
  const list: Array<Record<string, string>> = []
  for (let i = 0; i < THEME_POINT_LIMIT; i++) {
    const p = (src[i] && typeof src[i] === 'object' ? src[i] : {}) as Record<string, any>
    list.push({ 名字: p.name ?? '', 场景: p.scene ?? '', 姿势: p.pose ?? '', 构图: p.camera ?? '' })
  }
  themeJsonText.value = JSON.stringify({ 套图名字: String(editForm.value.name ?? ''), 提示词列表: list }, null, 2)
  themeJsonError.value = ''
  themeJsonVisible.value = true
}

/** 单个点位：中文键为主，兼容旧英文键（name/scene/pose/camera） */
function extractPoint(o: Record<string, unknown>): { name: string; scene: string; pose: string; camera: string } {
  return {
    name: String(o['名字'] ?? o.name ?? ''),
    scene: String(o['场景'] ?? o.scene ?? ''),
    pose: String(o['姿势'] ?? o.pose ?? ''),
    camera: String(o['构图'] ?? o.camera ?? ''),
  }
}

/** 校验并填充：名称（JSON 中有值才覆盖）+ 点位四字段（截取前 5 个，不足由点位编辑器自动补空）+ 点位路径（点位名依次连接） */
function applyThemeJson() {
  let parsed: unknown
  try {
    parsed = JSON.parse(themeJsonText.value)
  } catch {
    themeJsonError.value = 'JSON 格式错误，请检查引号 / 逗号是否完整'
    return
  }
  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
  if (!root || !Array.isArray(root['提示词列表'])) {
    themeJsonError.value = '顶层需为 JSON 对象，且包含「套图名字」与「提示词列表」（数组）两个字段'
    return
  }
  const list = root['提示词列表'] as unknown[]
  if (!list.length) {
    themeJsonError.value = '「提示词列表」不能为空'
    return
  }
  const name = String(root['套图名字'] ?? '').trim()
  if (name) editForm.value.name = name
  const truncated = list.length > THEME_POINT_LIMIT
  const points = list
    .map((x) => extractPoint(x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
    .slice(0, THEME_POINT_LIMIT)
  editForm.value.point_details = points
  const names = points.map((p) => p.name.trim()).filter(Boolean)
  if (names.length) editForm.value.path = names.join(' → ')
  themeJsonVisible.value = false
  ui.success(truncated ? `已填充（点位超过 ${THEME_POINT_LIMIT} 个，已截取前 ${THEME_POINT_LIMIT} 个）` : 'JSON 已填充到表单')
}

/** 表单值 → API 值：JSON 字段反序列化、点位按行拆分 */
function toApiPayload(): Record<string, unknown> {
  const payload: Record<string, any> = {}
  for (const f of currentTab.value.fields) {
    const key = f.key
    let v: any = editForm.value[f.key]
    if (isArrayField(f)) {
      payload[key] = Array.isArray(v) ? v : []
      continue
    }
    if (v === undefined || v === '') continue
    if (['fingerprint', 'match_tags', 'models', 'scope', 'point_details'].includes(key) && typeof v === 'string') {
      try { v = JSON.parse(v) } catch { ui.warning(`${f.label} 不是合法 JSON，已按原样保存文本`); v = v }
    } else if (key === 'order_no') {
      v = Number(v) || 0
    } else if (currentTab.value.type === 'knowledge' && key === 'content' && typeof v === 'string') {
      try { v = JSON.parse(v) } catch { /* content 允许纯文本 */ }
    }
    payload[key] = v
  }
  return payload
}

async function save() {
  saving.value = true
  try {
    const payload = toApiPayload()
    const missing = currentTab.value.required.filter((k) => !payload[k])
    if (missing.length) {
      ui.warning(`缺少必填字段：${missing.join('、')}`)
      return
    }
    if (editingId.value) {
      await sgApi.updateAsset(activeType.value, editingId.value, payload)
    } else {
      await sgApi.createAsset(activeType.value, payload, true)
    }
    ui.success('已保存（全局资产）')
    editVisible.value = false
    await load()
  } catch (e) {
    ui.error(e, '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: any) {
  try {
    await sgApi.updateAsset(activeType.value, row.id, { status: row.status === 'active' ? 'disabled' : 'active' })
    await load()
  } catch (e) {
    ui.error(e, '操作失败')
  }
}

async function removeRow(row: any) {
  try {
    await ui.confirmDanger({ message: `确认删除该${currentTab.value.label}资产？（种子资产不可删除）` })
  } catch { return }
  try {
    await sgApi.deleteAsset(activeType.value, row.id)
    ui.success('已删除')
    await load()
  } catch (e) {
    ui.error(e, '删除失败')
  }
}

async function publishCard() {
  if (!selectedRow.value) return
  try {
    await sgApi.publishLockCard(selectedRow.value.id)
    ui.success('已发布为官方提示词卡片，可在提示词工坊查看')
  } catch (e) {
    ui.error(e, '发布失败')
  }
}

onMounted(load)
</script>

<style scoped>
/* 全出血表格贴在页面灰底上：吸顶表头与吸边操作列需与底色一致，否则滚动时色块脱节 */
.table-host {
  --table-sticky-bg: var(--momo-color-bg-page);
  --table-sticky-hover-bg: color-mix(in oklab, var(--momo-color-bg-muted) 50%, var(--momo-color-bg-page));
}

/* 组图入口：首图当封面，整组交给预览器翻页 */
.images-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: zoom-in;
}
.col-thumb {
  display: block;
  width: 36px;
  height: 36px;
  border-radius: var(--momo-radius-sm);
  object-fit: cover;
}
.col-muted { color: var(--momo-color-text-tertiary); }
.points-block { width: 100%; display: flex; flex-direction: column; gap: var(--momo-space-2); }
.points-toolbar { display: flex; align-items: center; gap: var(--momo-space-2); }
.points-tip { font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary); }
.json-tip { margin-bottom: var(--momo-space-2); font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); line-height: 1.6; }
.json-input { font-family: var(--momo-font-mono); }
.json-error { margin-top: var(--momo-space-1); font-size: var(--momo-font-size-xs); color: var(--momo-color-danger); }
</style>
