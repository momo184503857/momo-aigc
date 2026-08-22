<script setup lang="ts">
/**
 * ThemeLibraryPage - 主题库。
 * 浏览管理员配置的官方主题（sg_themes 全局行）与自己上传的主题；
 * 支持筛选搜索、排序、收藏；自己上传的主题可编辑、可删除、可切换公开/私有。
 * 点击封面图片进入主题详情；卡片底部常驻操作按钮：收藏 / 成套提示词 / 更多（我的，
 * 下拉：编辑 / 公开切换 / 删除），样式对齐作品库卡片操作行。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import PointDetailsField from '@/components/PointDetailsField.vue'
import { themeLibraryApi, type ThemeItem, type ThemeListParams } from '@/services/themeLibraryApi'
import { ossApi } from '@/services/ossApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { buildPointDetails, type ThemePointDetail } from '@/utils/themePoints'
import {
  Search, Refresh, Upload, UploadFilled, Star, StarFilled,
  View, Hide, Delete, Picture, Loading, Close, MagicStick, EditPen, MoreFilled, CopyDocument,
} from '@element-plus/icons-vue'

defineOptions({ name: 'ThemeLibraryPage' })

const router = useRouter()

const { success, warning, error, confirmDanger } = useUiFeedback()
const { retryOnError } = useImageRetry()

// ── 列表状态 ──
const loading = ref(false)
const themes = ref<ThemeItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(24)

// ── 筛选 / 搜索 / 排序 ──
const keyword = ref('')
const scope = ref<'all' | 'official' | 'mine' | 'favorites'>('all')
const season = ref('')
const style = ref('')
const sort = ref<'default' | 'latest' | 'hot' | 'favorite'>('default')

const scopeOptions = [
  { value: 'all', label: '全部主题' },
  { value: 'official', label: '官方主题' },
  { value: 'mine', label: '我上传的' },
  { value: 'favorites', label: '我的收藏' },
]
const seasonOptions = [
  { value: '春', label: '春' },
  { value: '夏', label: '夏' },
  { value: '秋', label: '秋' },
  { value: '冬', label: '冬' },
  { value: 'none', label: '全季' },
]
const styleOptions = [
  '新中式国风', '文艺风', '休闲', '极简', '法式', '度假',
  '优雅', '职场', '运动', '喜婆婆', '小香风',
]
const sortOptions = [
  { value: 'default', label: '默认' },
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '最热' },
  { value: 'favorite', label: '收藏最多' },
]

async function loadThemes() {
  loading.value = true
  try {
    const params: ThemeListParams = {
      page: page.value,
      pageSize: pageSize.value,
      scope: scope.value,
      sort: sort.value,
    }
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    if (season.value) params.season = season.value
    if (style.value) params.style = style.value

    const res = await themeLibraryApi.list(params)
    themes.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
  } catch (e) {
    error(e, '加载主题列表失败')
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  loadThemes()
}

function onPageChange(p: number) {
  page.value = p
  loadThemes()
}

function seasonText(t: ThemeItem): string {
  return t.season.length ? t.season.join(' ') : '全季'
}

// ── 卡片操作 ──
async function toggleFavorite(theme: ThemeItem) {
  try {
    const res = await themeLibraryApi.favorite(theme.id)
    theme.is_favorited = res.data.data.is_favorited
    theme.favorite_count = res.data.data.favorite_count
    success(theme.is_favorited ? '已收藏' : '已取消收藏')
  } catch (e) {
    error(e, '收藏操作失败')
  }
}

async function togglePublic(theme: ThemeItem) {
  try {
    const next = !theme.is_public
    await themeLibraryApi.update(theme.id, { is_public: next })
    theme.is_public = next
    success(next ? '已公开，其他用户可在主题库看到它' : '已设为私有，仅自己可见')
  } catch (e) {
    error(e, '切换公开状态失败')
  }
}

async function removeTheme(theme: ThemeItem) {
  try {
    await confirmDanger({
      title: '删除主题',
      message: `确定删除主题「${theme.name}」？删除后不可恢复。`,
      confirmText: '删除',
    })
  } catch {
    return
  }
  try {
    await themeLibraryApi.remove(theme.id)
    success('主题已删除')
    // 当前页删空时回退一页，避免停留在空页
    if (themes.value.length === 1 && page.value > 1) page.value -= 1
    loadThemes()
  } catch (e) {
    error(e, '删除主题失败')
  }
}

// ── 详情预览 ──
const detailVisible = ref(false)
const detailTheme = ref<ThemeItem | null>(null)
/** 三方联动的选中点位下标：图片 / 点位列表 / 提示词共用，点任一处其余两处同步 */
const selectedPoint = ref(0)
/** 主图跟随选中点位（图片数少于点位数时取最后一张） */
const detailImageIndex = computed(() => {
  const n = detailTheme.value?.images.length ?? 0
  if (!n) return 0
  return Math.min(selectedPoint.value, n - 1)
})

function openDetail(theme: ThemeItem) {
  detailTheme.value = theme
  selectedPoint.value = 0
  detailVisible.value = true
}

/** 折叠态点位摘要：取四字段里第一个非空值 */
function pointSummary(d: ThemePointDetail): string {
  return d.scene || d.pose || d.camera || d.name || '—'
}

/** 单个点位提示词文本（字段标签与成套提示词页的存储三字段格式一致） */
function pointPromptText(d: ThemePointDetail, i: number, total: number): string {
  return [
    d.name ? `【本张点位 ${i + 1}/${total}】${d.name}` : '',
    d.scene ? `【本张场景锁定·必须严格遵守】${d.scene}` : '',
    d.pose ? `【人物姿势】${d.pose}` : '',
    d.camera ? `【机位构图】${d.camera}` : '',
  ].filter(Boolean).join('\n')
}

async function copyToClipboard(text: string, okMsg: string) {
  if (!text.trim()) {
    warning('该点位暂无提示词内容')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    success(okMsg)
  } catch {
    error(new Error('复制失败'), '复制失败，请手动选择复制')
  }
}

/** 复制单个点位提示词（点击同时会选中该点位） */
function copyPointPrompt(i: number) {
  const list = detailTheme.value?.point_details || []
  const d = list[i]
  if (!d) return
  void copyToClipboard(pointPromptText(d, i, list.length), `已复制 P${i + 1} 提示词`)
}

/** 一键复制全部点位提示词（【点位N】分段，空行分隔） */
function copyAllPointPrompts() {
  const list = detailTheme.value?.point_details || []
  if (!list.length) return
  const text = list
    .map((d, i) => `【点位${i + 1}】\n${pointPromptText(d, i, list.length)}`)
    .join('\n\n')
  void copyToClipboard(text, `已复制全部 ${list.length} 个提示词`)
}

/** 「更多」下拉指令分发（仅自己的主题） */
function onMoreCommand(cmd: string, theme: ThemeItem) {
  if (cmd === 'edit') openEdit(theme)
  else if (cmd === 'public') togglePublic(theme)
  else if (cmd === 'delete') removeTheme(theme)
}

// ── 成套提示词：带入主题跳转 /suite-prompt ──
function goSuitePrompt(theme: ThemeItem) {
  sessionStorage.setItem('sp_theme_handoff', JSON.stringify(theme))
  router.push('/suite-prompt')
}

// ── 上传 / 编辑弹窗（双模式：editingTheme 为 null 时是上传，否则编辑该主题） ──
const uploadVisible = ref(false)
const submitting = ref(false)
const MAX_IMAGES = 5
const editingTheme = ref<ThemeItem | null>(null)

const form = ref({
  name: '',
  season: [] as string[],
  styles: [] as string[],
  path: '',
  points: [] as ThemePointDetail[],
  is_public: false,
})
interface ImgItem { url: string; loading?: boolean }
const formImages = ref<ImgItem[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

function openUpload() {
  editingTheme.value = null
  uploadVisible.value = true
}

/** 编辑已有主题：预填全部字段；无点位字段的旧主题按旧生成逻辑预填点位 */
function openEdit(theme: ThemeItem) {
  detailVisible.value = false
  editingTheme.value = theme
  form.value = {
    name: theme.name,
    season: [...theme.season],
    styles: [...theme.styles],
    path: theme.path,
    points: theme.point_details?.length
      ? theme.point_details.map((d) => ({ ...d }))
      : buildPointDetails(theme.name, theme.path, theme.points),
    is_public: theme.is_public,
  }
  formImages.value = theme.images.map((url) => ({ url }))
  uploadVisible.value = true
}

function resetForm() {
  editingTheme.value = null
  form.value = {
    name: '', season: [], styles: [],
    path: '', points: [], is_public: false,
  }
  formImages.value = []
}

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFiles(files: FileList | File[]) {
  const arr = Array.from(files)
  if (formImages.value.length + arr.length > MAX_IMAGES) {
    warning(`最多上传 ${MAX_IMAGES} 张图片`)
  }
  const room = MAX_IMAGES - formImages.value.length
  const toUpload = arr.slice(0, room)
  for (const file of toUpload) {
    const placeholder: ImgItem = { url: '', loading: true }
    formImages.value.push(placeholder)
    const idx = formImages.value.length - 1
    try {
      const res = await ossApi.upload(file, 'materials')
      formImages.value[idx] = { url: res.publicUrl }
    } catch (e) {
      formImages.value.splice(idx, 1)
      error(e, '图片上传失败')
    }
  }
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) handleFiles(target.files)
  target.value = '' // 允许重复选择同一文件
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
}

function removeImage(idx: number) {
  formImages.value.splice(idx, 1)
}

async function submitForm() {
  if (!form.value.name.trim()) {
    warning('请填写主题名称')
    return
  }
  if (formImages.value.length < 1) {
    warning('至少上传 1 张主题图片')
    return
  }
  if (formImages.value.some((i) => i.loading)) {
    warning('图片正在上传，请稍候')
    return
  }

  submitting.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      season: form.value.season,
      styles: form.value.styles,
      images: formImages.value.map((i) => i.url),
      path: form.value.path.trim(),
      point_details: form.value.points,
      is_public: form.value.is_public,
    }
    if (editingTheme.value) {
      await themeLibraryApi.update(editingTheme.value.id, payload)
      success('主题已更新')
    } else {
      await themeLibraryApi.create(payload)
      success('主题已上传')
      // 跳到「我上传的」让用户立刻看到新主题
      scope.value = 'mine'
      sort.value = 'latest'
    }
    uploadVisible.value = false
    resetForm()
    page.value = 1
    loadThemes()
  } catch (e) {
    error(e, editingTheme.value ? '更新主题失败' : '上传主题失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadThemes()
})
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>主题库</h2>
    </template>
    <template #extra>
      <el-button type="primary" :icon="Upload" @click="openUpload">上传主题</el-button>
    </template>

    <!-- 筛选搜索区 -->
    <div class="filter-bar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索主题名称 / 动线"
        clearable
        class="filter-search"
        @keyup.enter="applyFilters"
        @clear="applyFilters"
      />
      <el-select v-model="scope" @change="applyFilters" class="filter-select">
        <el-option v-for="s in scopeOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-select v-model="season" placeholder="全部季节" clearable @change="applyFilters" class="filter-select filter-select-sm">
        <el-option v-for="s in seasonOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-select v-model="style" placeholder="全部风格" clearable filterable @change="applyFilters" class="filter-select">
        <el-option v-for="s in styleOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-button :icon="Refresh" @click="loadThemes" circle size="small" />
    </div>

    <!-- 排序栏 -->
    <div class="sort-bar">
      <span class="sort-label">排序：</span>
      <el-radio-group v-model="sort" @change="applyFilters" size="small">
        <el-radio-button v-for="s in sortOptions" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
      </el-radio-group>
      <span class="sort-total">共 {{ total }} 个主题</span>
    </div>

    <!-- 主题卡片网格 -->
    <div v-loading="loading" class="themes-grid-wrap">
      <div v-if="!loading && themes.length === 0" class="themes-empty">
        <el-empty :description="scope === 'favorites' ? '暂无收藏的主题' : scope === 'mine' ? '你还没有上传过主题' : '暂无主题'" />
      </div>
      <div v-else class="themes-grid">
        <div v-for="t in themes" :key="t.id" class="theme-card">
          <div class="theme-cover" title="查看主题详情" @click="openDetail(t)">
            <img
              v-if="t.cover_url"
              :src="t.cover_url"
              alt="主题图片"
              loading="lazy"
              @error="retryOnError($event, t.cover_url)"
            />
            <div v-else class="cover-placeholder">
              <el-icon size="32"><Picture /></el-icon>
            </div>

            <div class="cover-badges">
              <el-tag v-if="t.is_global" type="warning" size="small">官方</el-tag>
              <el-tag
                v-if="t.is_mine"
                :type="t.is_public ? 'success' : 'info'"
                size="small"
                effect="plain"
                >{{ t.is_public ? '公开' : '私有' }}</el-tag>
            </div>

            <div v-if="t.favorite_count > 0 || t.use_count > 0" class="cover-stats">
              <span v-if="t.favorite_count > 0"><el-icon size="12"><StarFilled /></el-icon>{{ t.favorite_count }}</span>
              <span v-if="t.use_count > 0">使用 {{ t.use_count }}</span>
            </div>
          </div>

          <div class="theme-info">
            <div class="theme-name" :title="t.name">{{ t.name }}</div>
            <div class="theme-meta">
              <span>{{ seasonText(t) }}</span>
            </div>
            <div v-if="t.styles.length" class="theme-styles">
              <el-tag v-for="s in t.styles.slice(0, 2)" :key="s" size="small" effect="plain">{{ s }}</el-tag>
              <span v-if="t.styles.length > 2" class="styles-more">+{{ t.styles.length - 2 }}</span>
            </div>
          </div>

          <!-- 卡片底部常驻操作行（不依赖 hover） -->
          <div class="card-actions">
            <button
              class="action-btn"
              :class="{ 'is-active': t.is_favorited }"
              :title="t.is_favorited ? '取消收藏' : '收藏'"
              @click.stop="toggleFavorite(t)"
            >
              <span class="action-top"><el-icon size="15"><StarFilled v-if="t.is_favorited" /><Star v-else /></el-icon><span>收藏</span></span>
            </button>
            <button class="action-btn" title="生成成套提示词" @click.stop="goSuitePrompt(t)">
              <span class="action-top"><el-icon size="15"><MagicStick /></el-icon><span>成套提示词</span></span>
            </button>
            <el-dropdown v-if="t.is_mine" trigger="click" @command="(cmd: string) => onMoreCommand(cmd, t)">
              <button class="action-btn" title="更多操作" @click.stop>
                <span class="action-top"><el-icon size="15"><MoreFilled /></el-icon><span>更多</span></span>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit" :icon="EditPen">编辑主题</el-dropdown-item>
                  <el-dropdown-item command="public" :icon="t.is_public ? Hide : View">
                    {{ t.is_public ? '设为私有' : '公开给其他用户' }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" :icon="Delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="pager-row">
        <el-pagination
          background
          layout="total, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="onPageChange"
        />
      </div>
    </template>
  </PageLayout>

  <!-- 详情预览弹窗 -->
  <el-dialog
    v-model="detailVisible"
    :title="detailTheme?.name || '主题详情'"
    width="80%"
    align-center
    class="theme-detail-dialog"
  >
    <div v-if="detailTheme" class="detail-body">
      <div class="detail-gallery">
        <el-image
          v-if="detailTheme.images.length"
          :src="detailTheme.images[detailImageIndex]"
          :preview-src-list="detailTheme.images"
          :initial-index="detailImageIndex"
          fit="cover"
          class="detail-main-img"
          preview-teleported
        />
        <div v-else class="detail-main-img cover-placeholder">
          <el-icon size="40"><Picture /></el-icon>
        </div>
        <!-- 缩略图与点位联动：点缩略图即选中对应点位，主图/提示词同步 -->
        <div v-if="detailTheme.images.length > 1" class="detail-thumbs">
          <img
            v-for="(img, idx) in detailTheme.images"
            :key="idx"
            :src="img"
            :class="{ active: idx === detailImageIndex }"
            @click="selectedPoint = idx"
          />
        </div>

        <!-- 点位选择器：与图片/提示词联动，选中哪个点位其余两处同步 -->
        <div v-if="detailTheme.point_details?.length" class="point-picker">
          <div class="pp-title">点位（{{ detailTheme.point_details.length }}）</div>
          <button
            v-for="(d, i) in detailTheme.point_details"
            :key="i"
            class="pp-item"
            :class="{ active: i === selectedPoint }"
            :title="d.name || `点位 ${i + 1}`"
            @click="selectedPoint = i"
          >
            <span class="pp-idx">P{{ i + 1 }}</span>
            <span class="pp-name">{{ d.name || '未命名点位' }}</span>
          </button>
        </div>
      </div>

      <div class="detail-meta">
        <div class="meta-row">
          <span class="meta-label">来源</span>
          <span>
            <el-tag v-if="detailTheme.is_global" type="warning" size="small">官方</el-tag>
            <template v-else-if="detailTheme.author">
              {{ detailTheme.author.nickname || detailTheme.author.username }}
              <el-tag size="small" effect="plain" :type="detailTheme.is_public ? 'success' : 'info'">
                {{ detailTheme.is_public ? '公开' : '私有' }}
              </el-tag>
            </template>
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">季节</span>
          <span>{{ seasonText(detailTheme) }}</span>
        </div>
        <div v-if="detailTheme.styles.length" class="meta-row">
          <span class="meta-label">适合风格</span>
          <span>
            <el-tag v-for="s in detailTheme.styles" :key="s" size="small" effect="plain" class="meta-tag">{{ s }}</el-tag>
          </span>
        </div>
        <div v-if="detailTheme.path" class="meta-row">
          <span class="meta-label">动线</span>
          <span>{{ detailTheme.path }}</span>
        </div>
        <div v-if="detailTheme.point_details?.length" class="meta-row">
          <span class="meta-label">点位提示词</span>
          <div class="meta-points-detail">
            <div class="pd-toolbar">
              <span class="pd-tip">点击行选中点位</span>
              <el-button size="small" :icon="CopyDocument" @click="copyAllPointPrompts">
                复制全部 {{ detailTheme.point_details.length }} 个
              </el-button>
            </div>
            <!-- 提示词行可点击选中点位，与图片/点位列表联动；未选中折叠为单行摘要 -->
            <div
              v-for="(d, i) in detailTheme.point_details"
              :key="i"
              class="point-detail-item"
              :class="{ active: i === selectedPoint }"
              @click="selectedPoint = i"
            >
              <span class="pd-idx">P{{ i + 1 }}</span>
              <div class="pd-body">
                <div v-if="i !== selectedPoint" class="pd-summary">{{ pointSummary(d) }}</div>
                <template v-else>
                  <div v-if="d.name" class="pd-line"><span class="pd-k">点位名</span><span class="pd-v" :title="d.name">{{ d.name }}</span></div>
                  <div v-if="d.scene" class="pd-line"><span class="pd-k">场景锁定</span><span class="pd-v" :title="d.scene">{{ d.scene }}</span></div>
                  <div v-if="d.pose" class="pd-line"><span class="pd-k">人物姿势</span><span class="pd-v" :title="d.pose">{{ d.pose }}</span></div>
                  <div v-if="d.camera" class="pd-line"><span class="pd-k">机位构图</span><span class="pd-v" :title="d.camera">{{ d.camera }}</span></div>
                </template>
              </div>
              <el-button
                class="pd-copy"
                link
                size="small"
                :icon="CopyDocument"
                title="复制本条提示词"
                @click="copyPointPrompt(i)"
              >复制</el-button>
            </div>
          </div>
        </div>
        <div v-else-if="detailTheme.points.length" class="meta-row">
          <span class="meta-label">点位描述</span>
          <ol class="meta-points">
            <li v-for="(p, i) in detailTheme.points" :key="i">{{ p }}</li>
          </ol>
        </div>
        <div class="meta-row">
          <span class="meta-label">数据</span>
          <span>收藏 {{ detailTheme.favorite_count }} · 使用 {{ detailTheme.use_count }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button
        type="primary"
        :icon="MagicStick"
        @click="detailTheme && goSuitePrompt(detailTheme)"
      >
        成套提示词
      </el-button>
      <el-button
        v-if="detailTheme?.is_mine"
        :icon="EditPen"
        @click="detailTheme && openEdit(detailTheme)"
      >
        编辑
      </el-button>
      <el-button
        :type="detailTheme?.is_favorited ? 'warning' : 'default'"
        :icon="detailTheme?.is_favorited ? StarFilled : Star"
        @click="detailTheme && toggleFavorite(detailTheme)"
      >
        {{ detailTheme?.is_favorited ? '已收藏' : '收藏' }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 上传 / 编辑主题弹窗 -->
  <el-dialog
    v-model="uploadVisible"
    :title="editingTheme ? '编辑主题' : '上传主题'"
    width="600px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-form label-position="top">
      <el-form-item required label="主题名称">
        <el-input v-model="form.name" placeholder="如：中式园林庭院" maxlength="50" show-word-limit />
      </el-form-item>

      <el-form-item label="季节（不选 = 全季）">
        <el-checkbox-group v-model="form.season">
          <el-checkbox v-for="s in ['春', '夏', '秋', '冬']" :key="s" :value="s">{{ s }}</el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="适合风格（至多 3 个）">
        <el-select v-model="form.styles" multiple :multiple-limit="3" placeholder="选择风格（可选）" style="width: 100%">
          <el-option v-for="s in styleOptions" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>

      <el-form-item label="动线路径（可选）">
        <el-input v-model="form.path" placeholder="如：院外 → 中庭 → 池塘边 → 廊桥 → 茶室" maxlength="255" />
      </el-form-item>

      <el-form-item label="点位提示词（固定 5 个点位，成套提示词按此生成）">
        <PointDetailsField v-model="form.points" />
      </el-form-item>

      <el-form-item required label="主题图片（1~5 张，首图为封面）">
        <div class="upload-area" @drop="onDrop" @dragover.prevent>
          <div class="img-grid">
            <div v-for="(img, idx) in formImages" :key="idx" class="img-cell" :class="{ 'is-cover': idx === 0 }">
              <div v-if="img.loading" class="img-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>
              <img v-else :src="img.url" alt="预览图" />
              <div class="img-overlay">
                <el-button text size="small" :icon="Close" title="删除" @click.stop="removeImage(idx)" />
              </div>
              <span v-if="idx === 0" class="cover-badge">封面</span>
            </div>
            <div v-if="formImages.length < MAX_IMAGES" class="upload-trigger" @click="triggerUpload">
              <el-icon size="24"><UploadFilled /></el-icon>
              <span>点击或拖拽上传</span>
              <span class="upload-tip">{{ formImages.length }} / {{ MAX_IMAGES }}</span>
            </div>
          </div>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            multiple
            style="display: none"
            @change="onFileChange"
          />
        </div>
      </el-form-item>

      <el-form-item>
        <div class="public-switch-row">
          <el-switch v-model="form.is_public" />
          <span>公开到主题库（关闭则仅自己可见）</span>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="uploadVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submitForm">
        {{ editingTheme ? '保存' : '上传' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.filter-search {
  width: 220px;
}
.filter-select {
  width: 140px;
}
.filter-select-sm {
  width: 110px;
}

.sort-bar {
  display: flex;
  align-items: center;
  padding-bottom: 16px;
}
.sort-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  margin-right: 8px;
}
.sort-total {
  margin-left: auto;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
}

.themes-grid-wrap {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.themes-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}
.themes-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  padding-right: 4px;
}

/* ── 主题卡片 ── */
.theme-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--el-bg-color);
  transition: box-shadow 0.2s, transform 0.2s;
}
.theme-card:hover {
  box-shadow: var(--momo-box-shadow);
  transform: translateY(-2px);
}

.theme-cover {
  position: relative;
  aspect-ratio: 4 / 5;
  background: var(--el-fill-color);
  overflow: hidden;
  cursor: pointer;
}
.theme-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.cover-badges {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  gap: 6px;
}

/* 卡片底部常驻操作行（样式对齐作品库卡片） */
.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--momo-radius-sm);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.action-btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.action-btn.is-active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.action-top {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--momo-font-size-sm);
}

.cover-stats {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: flex;
  gap: 8px;
  font-size: var(--momo-font-size-xs);
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.cover-stats span {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.theme-info {
  flex: 1;
  padding: 10px 12px;
}
.theme-name {
  font-size: var(--momo-font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.theme-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}
.theme-meta span:not(:first-child)::before {
  content: '·';
  margin-right: 6px;
  color: var(--el-text-color-placeholder);
}
.theme-styles {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.styles-more {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
}

.pager-row {
  display: flex;
  justify-content: flex-end;
}

/* ── 详情弹窗 ── */
.detail-body {
  display: flex;
  gap: 20px;
}
.detail-gallery {
  width: 280px;
  flex-shrink: 0;
}
.detail-main-img {
  width: 280px;
  height: 350px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--el-fill-color);
  display: flex;
  align-items: center;
  justify-content: center;
}
.detail-thumbs {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.detail-thumbs img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--momo-radius-sm);
  border: 2px solid transparent;
  cursor: pointer;
}
.detail-thumbs img.active {
  border-color: var(--el-color-primary);
}
.detail-meta {
  flex: 1;
  min-width: 0;
  /* 点位多时内容在列内滚动，弹窗整体不超过一屏 */
  max-height: 64vh;
  overflow-y: auto;
  padding-right: 4px;
}
.meta-row {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: var(--momo-font-size-sm);
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.meta-label {
  width: 64px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.meta-tag {
  margin-right: 4px;
}
.meta-points {
  margin: 0;
  padding-left: 18px;
  color: var(--el-text-color-regular);
}
.meta-points li {
  margin-bottom: 2px;
}

/* ── 详情弹窗 · 点位选择器（左栏，选中项同步右侧提示词） ── */
.point-picker {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}
.pp-title {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}
.pp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-sm);
  background: var(--el-bg-color);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.pp-item:hover {
  border-color: var(--el-color-primary);
}
.pp-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.pp-item.active .pp-idx,
.pp-item.active .pp-name {
  color: var(--el-color-primary);
}
.pp-idx {
  flex-shrink: 0;
  font-weight: 600;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text);
}
.pp-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
}

/* ── 详情弹窗 · 点位提示词（右栏，与图片/点位三方联动的可点击列表） ── */
.meta-points-detail {
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-2);
  flex: 1;
  min-width: 0;
}
.point-detail-item {
  display: flex;
  gap: var(--momo-space-2);
  align-items: flex-start;
  cursor: pointer;
  padding: var(--momo-space-1) var(--momo-space-2);
  border: 1px solid transparent;
  border-radius: var(--momo-radius-sm);
  transition: background-color 0.15s, border-color 0.15s;
}
.point-detail-item:hover {
  background: var(--el-fill-color-light);
}
.point-detail-item.active {
  background: var(--momo-color-brand-subtle);
  border-color: var(--momo-color-brand-border);
}
.pd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--momo-space-2);
}
.pd-tip {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
}
.pd-copy {
  flex-shrink: 0;
  align-self: center;
  margin-left: var(--momo-space-1);
}
.pd-summary {
  font-size: 13px;
  line-height: 1.6;
  color: var(--momo-color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pd-idx {
  flex-shrink: 0;
  min-width: 44px;
  font-weight: 600;
  color: var(--momo-color-text);
}
.point-detail-item.active .pd-idx {
  color: var(--momo-color-brand);
}
.pd-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.pd-line {
  display: flex;
  gap: var(--momo-space-2);
  font-size: 13px;
  line-height: 1.6;
  color: var(--momo-color-text-secondary);
}
.pd-k {
  flex-shrink: 0;
  color: var(--momo-color-text-tertiary);
}
.pd-k::after {
  content: '：';
}
.pd-v {
  flex: 1;
  min-width: 0;
  white-space: pre-line;
  /* 每字段最多显示 2 行，超出省略号；完整内容看悬停提示或走复制 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* ── 上传 / 编辑弹窗 ── */
.public-switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
}
.upload-area {
  width: 100%;
}
.img-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  width: 100%;
}
.img-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  background: var(--el-fill-color);
  border: 2px solid transparent;
}
.img-cell.is-cover {
  border-color: var(--el-color-primary);
}
.img-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.img-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.img-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.45), transparent 60%);
  opacity: 0;
  transition: opacity 0.15s;
}
.img-cell:hover .img-overlay {
  opacity: 1;
}
.img-overlay .el-button {
  color: #fff;
  margin: 2px;
  padding: 4px;
}
.cover-badge {
  position: absolute;
  left: 2px;
  bottom: 2px;
  font-size: var(--momo-font-size-xs);
  color: #fff;
  background: var(--el-color-primary);
  padding: 1px 6px;
  border-radius: var(--momo-radius-sm);
}
.upload-trigger {
  aspect-ratio: 1;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--momo-radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--el-text-color-placeholder);
  transition: border-color 0.15s, color 0.15s;
}
.upload-trigger:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.upload-trigger span {
  font-size: var(--momo-font-size-xs);
}
.upload-tip {
  opacity: 0.7;
}
</style>

<style>
/* 详情大弹窗（约 80% × 80vh）：el-dialog 被传送出 scoped 树，尺寸规则需全局声明；
   高度写死在 .el-dialog 上，body 区自适应高度并内部滚动 */
.theme-detail-dialog {
  height: 80vh;
  display: flex;
  flex-direction: column;
}
.theme-detail-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
