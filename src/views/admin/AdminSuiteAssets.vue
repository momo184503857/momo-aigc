<template>
  <PageLayout title="成套生图资产管理" subtitle="管理员维护全局资产（全员可用）：主题库 / 模特人设 / 锁定模板 / 服装特征 / 拆解知识">
    <div class="sg-admin">
      <el-tabs v-model="activeType" type="border-card" @tab-change="load">
        <el-tab-pane v-for="t in TYPE_TABS" :key="t.type" :label="t.label" :name="t.type" />
      </el-tabs>

      <div class="toolbar">
        <el-input
          v-model="keyword"
          size="default"
          clearable
          placeholder="搜索名称/关键词…"
          style="width: 240px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="openCreate">＋ 新建{{ currentTab.label }}</el-button>
        <el-button
          v-if="activeType === 'lock-templates'"
          :disabled="!selectedRow"
          @click="publishCard"
        >发布为官方提示词卡片</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" border stripe @current-change="(r: any) => (selectedRow = r)">
        <el-table-column prop="id" label="ID" width="64" />
        <el-table-column label="归属" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isGlobal ? 'primary' : 'success'" size="small">{{ row.isGlobal ? '全局' : '私有' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          v-for="col in currentTab.columns"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :width="col.width"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <template v-if="col.type === 'images'">
              <el-image
                v-if="(row[col.key] || []).length"
                :src="row[col.key][0]"
                :preview-src-list="row[col.key]"
                preview-teleported
                fit="cover"
                class="col-thumb"
              />
              <span v-else class="col-muted">—</span>
              <span v-if="(row[col.key] || []).length" class="col-muted" style="margin-left: 6px">{{ row[col.key].length }}张</span>
            </template>
            <span v-else-if="col.render">{{ col.render(row) }}</span>
            <span v-else-if="Array.isArray(row[col.key])">{{ (row[col.key] as any[]).length }} 项</span>
            <span v-else>{{ row[col.key] }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="use_count" label="热度" width="70" sortable />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link size="small" @click="toggleStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
            <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 编辑弹窗 -->
      <el-dialog v-model="editVisible" :title="(editingId ? '编辑' : '新建') + currentTab.label" width="640px">
        <el-form label-width="110px">
          <el-form-item
            v-for="f in currentTab.fields"
            :key="f.key"
            :label="f.label"
            :required="currentTab.required.includes(f.key)"
          >
            <MultiImageUpload
              v-if="f.images"
              v-model="editForm[f.key]"
              :max="f.max || 5"
              :sortable="f.sortable || false"
              :caption-prefix="f.captionPrefix"
            />
            <PointDetailsField
              v-else-if="f.pointDetails"
              :key="editingId ?? 'new'"
              v-model="editForm[f.key]"
              allow-json
            />
            <el-select
              v-else-if="f.options"
              v-model="editForm[f.key]"
              :multiple="f.multiple || false"
              :collapse-tags="f.multiple || false"
              :collapse-tags-tooltip="f.multiple || false"
              style="width: 100%"
            >
              <el-option v-for="o in f.options" :key="o" :value="o" :label="o" />
            </el-select>
            <el-input
              v-else-if="f.textarea"
              v-model="editForm[f.key]"
              type="textarea"
              :rows="f.rows || 4"
              :placeholder="f.placeholder"
            />
            <el-input v-else v-model="editForm[f.key]" :placeholder="f.placeholder" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </template>
      </el-dialog>
    </div>
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
import { sgApi, type SgAssetType } from '@/services/sgApi'

const ui = useUiFeedback()

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
  /** 点位编辑器（固定 5 点位 Tab，四字段；值为 point_details 数组，管理端附 JSON 模式） */
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
.sg-admin { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.toolbar { display: flex; gap: var(--momo-space-2); align-items: center; }
.col-thumb { width: 36px; height: 36px; border-radius: var(--momo-radius-sm); vertical-align: middle; }
.col-muted { color: var(--momo-color-text-tertiary); }
</style>
