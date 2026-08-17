<script setup lang="ts">
/**
 * ThemeLibraryPage - 主题库。
 * 浏览管理员配置的官方主题（sg_themes 全局行）与自己上传的主题；
 * 支持筛选搜索、排序、收藏；自己上传的主题可删除、可切换公开/私有。
 * 卡片 hover 出现操作按钮：收藏 / 预览 / 公开切换（我的）/ 删除（我的）。
 */
import { ref, onMounted } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import { themeLibraryApi, type ThemeItem, type ThemeListParams } from '@/services/themeLibraryApi'
import { sgApi, type SgTrack } from '@/services/sgApi'
import { ossApi } from '@/services/ossApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import {
  Search, Refresh, Upload, UploadFilled, Star, StarFilled, ZoomIn,
  View, Hide, Delete, Picture, Loading, Close,
} from '@element-plus/icons-vue'

defineOptions({ name: 'ThemeLibraryPage' })

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
const trackKey = ref('')
const season = ref('')
const style = ref('')
const level = ref('')
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
const levelOptions = [
  { value: 'L', label: 'L' },
  { value: 'M', label: 'M' },
  { value: 'H', label: 'H' },
]
const sortOptions = [
  { value: 'default', label: '默认' },
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '最热' },
  { value: 'favorite', label: '收藏最多' },
]

const tracks = ref<SgTrack[]>([])

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
    if (trackKey.value) params.track_key = trackKey.value
    if (season.value) params.season = season.value
    if (style.value) params.style = style.value
    if (level.value) params.level = level.value

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

async function loadTracks() {
  try {
    const res = await sgApi.listAssets<SgTrack>('tracks', { scope: 'global', pageSize: 100 })
    tracks.value = res.data.data?.records || []
  } catch { /* 筛选下拉降级为空，不影响列表 */ }
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
const detailImageIndex = ref(0)

function openDetail(theme: ThemeItem) {
  detailTheme.value = theme
  detailImageIndex.value = 0
  detailVisible.value = true
}

// ── 上传弹窗 ──
const uploadVisible = ref(false)
const submitting = ref(false)
const MAX_IMAGES = 5

const form = ref({
  name: '',
  track_key: '',
  season: [] as string[],
  styles: [] as string[],
  level: 'M',
  path: '',
  pointsText: '',
  is_public: false,
})
interface ImgItem { url: string; loading?: boolean }
const formImages = ref<ImgItem[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

function openUpload() {
  uploadVisible.value = true
}

function resetForm() {
  form.value = {
    name: '', track_key: '', season: [], styles: [],
    level: 'M', path: '', pointsText: '', is_public: false,
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

async function submitUpload() {
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
    await themeLibraryApi.create({
      name: form.value.name.trim(),
      track_key: form.value.track_key,
      season: form.value.season,
      styles: form.value.styles,
      images: formImages.value.map((i) => i.url),
      level: form.value.level,
      path: form.value.path.trim(),
      points: form.value.pointsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      is_public: form.value.is_public,
    })
    success('主题已上传')
    uploadVisible.value = false
    resetForm()
    // 跳到「我上传的」让用户立刻看到新主题
    scope.value = 'mine'
    sort.value = 'latest'
    page.value = 1
    loadThemes()
  } catch (e) {
    error(e, '上传主题失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadTracks()
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
      <el-select v-model="trackKey" placeholder="全部赛道" clearable @change="applyFilters" class="filter-select">
        <el-option v-for="t in tracks" :key="t.key" :label="`${t.emoji || ''} ${t.name}`.trim()" :value="t.key" />
      </el-select>
      <el-select v-model="season" placeholder="全部季节" clearable @change="applyFilters" class="filter-select filter-select-sm">
        <el-option v-for="s in seasonOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-select v-model="style" placeholder="全部风格" clearable filterable @change="applyFilters" class="filter-select">
        <el-option v-for="s in styleOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-select v-model="level" placeholder="复杂度" clearable @change="applyFilters" class="filter-select filter-select-xs">
        <el-option v-for="l in levelOptions" :key="l.value" :label="l.label" :value="l.value" />
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
        <div v-for="t in themes" :key="t.id" class="theme-card" @click="openDetail(t)">
          <div class="theme-cover">
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

            <!-- hover 操作按钮 -->
            <div class="cover-actions" @click.stop>
              <button
                class="hover-btn"
                :class="{ 'is-active': t.is_favorited }"
                :title="t.is_favorited ? '取消收藏' : '收藏'"
                @click="toggleFavorite(t)"
              >
                <el-icon size="16"><StarFilled v-if="t.is_favorited" /><Star v-else /></el-icon>
              </button>
              <button class="hover-btn" title="预览详情" @click="openDetail(t)">
                <el-icon size="16"><ZoomIn /></el-icon>
              </button>
              <button
                v-if="t.is_mine"
                class="hover-btn"
                :title="t.is_public ? '设为私有' : '公开给其他用户'"
                @click="togglePublic(t)"
              >
                <el-icon size="16"><Hide v-if="t.is_public" /><View v-else /></el-icon>
              </button>
              <button v-if="t.is_mine" class="hover-btn is-danger" title="删除" @click="removeTheme(t)">
                <el-icon size="16"><Delete /></el-icon>
              </button>
            </div>

            <div v-if="t.favorite_count > 0 || t.use_count > 0" class="cover-stats">
              <span v-if="t.favorite_count > 0"><el-icon size="12"><StarFilled /></el-icon>{{ t.favorite_count }}</span>
              <span v-if="t.use_count > 0">使用 {{ t.use_count }}</span>
            </div>
          </div>

          <div class="theme-info">
            <div class="theme-name" :title="t.name">{{ t.name }}</div>
            <div class="theme-meta">
              <span v-if="t.track_name">{{ t.track_name }}</span>
              <span>{{ seasonText(t) }}</span>
              <span v-if="t.level">复杂度 {{ t.level }}</span>
            </div>
            <div v-if="t.styles.length" class="theme-styles">
              <el-tag v-for="s in t.styles.slice(0, 2)" :key="s" size="small" effect="plain">{{ s }}</el-tag>
              <span v-if="t.styles.length > 2" class="styles-more">+{{ t.styles.length - 2 }}</span>
            </div>
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
  <el-dialog v-model="detailVisible" :title="detailTheme?.name || '主题详情'" width="720px">
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
        <div v-if="detailTheme.images.length > 1" class="detail-thumbs">
          <img
            v-for="(img, idx) in detailTheme.images"
            :key="idx"
            :src="img"
            :class="{ active: idx === detailImageIndex }"
            @click="detailImageIndex = idx"
          />
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
        <div v-if="detailTheme.track_name" class="meta-row">
          <span class="meta-label">赛道</span>
          <span>{{ detailTheme.track_name }}</span>
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
        <div v-if="detailTheme.level" class="meta-row">
          <span class="meta-label">复杂度</span>
          <span>{{ detailTheme.level }}</span>
        </div>
        <div v-if="detailTheme.path" class="meta-row">
          <span class="meta-label">动线</span>
          <span>{{ detailTheme.path }}</span>
        </div>
        <div v-if="detailTheme.points.length" class="meta-row">
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
        :type="detailTheme?.is_favorited ? 'warning' : 'default'"
        :icon="detailTheme?.is_favorited ? StarFilled : Star"
        @click="detailTheme && toggleFavorite(detailTheme)"
      >
        {{ detailTheme?.is_favorited ? '已收藏' : '收藏' }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 上传主题弹窗 -->
  <el-dialog v-model="uploadVisible" title="上传主题" width="600px" :close-on-click-modal="false" @closed="resetForm">
    <el-form label-position="top">
      <el-form-item required label="主题名称">
        <el-input v-model="form.name" placeholder="如：中式园林庭院" maxlength="50" show-word-limit />
      </el-form-item>

      <div class="form-row">
        <el-form-item label="赛道">
          <el-select v-model="form.track_key" placeholder="选择赛道（可选）" style="width: 100%">
            <el-option v-for="t in tracks" :key="t.key" :label="`${t.emoji || ''} ${t.name}`.trim()" :value="t.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="复杂度">
          <el-radio-group v-model="form.level">
            <el-radio-button v-for="l in levelOptions" :key="l.value" :value="l.value">{{ l.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </div>

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

      <el-form-item label="点位描述（可选）">
        <el-input
          v-model="form.pointsText"
          type="textarea"
          :rows="4"
          placeholder="每行一个点位描述"
          maxlength="1000"
          resize="none"
        />
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
      <el-button type="primary" :loading="submitting" @click="submitUpload">上传</el-button>
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
.filter-select-xs {
  width: 96px;
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
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--el-bg-color);
  cursor: pointer;
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

/* hover 操作按钮（需求：每个主题有 hover 按钮） */
.cover-actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.15s;
}
.theme-cover:hover .cover-actions {
  opacity: 1;
}
.hover-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: var(--el-text-color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}
.hover-btn:hover {
  background: var(--el-color-white);
  transform: scale(1.08);
}
.hover-btn.is-active {
  color: var(--el-color-warning);
}
.hover-btn.is-danger:hover {
  color: var(--el-color-danger);
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

/* ── 上传弹窗 ── */
.form-row {
  display: flex;
  gap: 16px;
}
.form-row .el-form-item {
  flex: 1;
}
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
