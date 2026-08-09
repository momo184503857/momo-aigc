<script setup lang="ts">
/**
 * WorksGalleryPage - 作品库广场。
 * 三个 Tab：作品广场（gallery） + 我的作品（mine） + 我的收藏（favorites）。
 * 瀑布流展示，支持按模式/标签筛选、关键词搜索、排序。
 */
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { worksApi } from '@/services/worksApi'
import type { WorkItem, WorkListParams } from '@/services/worksApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import { MODELS } from '@/types/adapter'
import { toBJMinute } from '@/utils/datetime'
import { Search, Star, StarFilled, Refresh, Picture } from '@element-plus/icons-vue'

defineOptions({ name: 'WorksGalleryPage' })

const router = useRouter()
const { error } = useUiFeedback()
const { retryOnError } = useImageRetry()

const activeTab = ref<'gallery' | 'mine' | 'favorites'>('gallery')
const loading = ref(false)
const works = ref<WorkItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(24)

// 筛选
const sort = ref<'latest' | 'hot' | 'most_reused'>('latest')
const featureId = ref('')
const tagId = ref<number | undefined>(undefined)
const keyword = ref('')

const tags = ref<{ id: number; name: string; usage_count: number }[]>([])

const featureOptions = [
  { id: '', label: '全部模式' },
  { id: 'free-gen', label: '自由生图' },
  ...Object.keys(FEATURE_CONFIGS).map((k) => ({ id: k, label: FEATURE_CONFIGS[k].label })),
]

const sortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'hot', label: '最热' },
  { value: 'most_reused', label: '最多复用' },
]

function modelDisplayName(modelId: string): string {
  return MODELS.find((m) => m.id === modelId)?.name || modelId
}

function featureLabel(fid: string | null): string {
  if (!fid || fid === 'free-gen') return '自由生图'
  return FEATURE_CONFIGS[fid]?.label || fid
}

async function loadTags() {
  try {
    const res = await worksApi.tags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}

async function loadWorks() {
  loading.value = true
  try {
    const params: WorkListParams = {
      page: page.value,
      pageSize: pageSize.value,
      sort: sort.value,
      scope: activeTab.value,
    }
    if (featureId.value) params.feature_id = featureId.value
    if (tagId.value) params.tag_id = tagId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()

    const res = await worksApi.list(params)
    works.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
  } catch (e) {
    error(e, '加载作品列表失败')
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  loadWorks()
}

function handlePageChange(p: number) {
  page.value = p
  loadWorks()
  // 回到顶部
  const el = document.querySelector('.works-masonry')
  el?.scrollTo({ top: 0, behavior: 'smooth' })
}

function openDetail(work: WorkItem) {
  router.push(`/works/${work.id}`)
}

// 切换 Tab 重置筛选并加载
watch(activeTab, () => {
  featureId.value = ''
  tagId.value = undefined
  keyword.value = ''
  sort.value = 'latest'
  page.value = 1
  loadWorks()
})

onMounted(() => {
  loadTags()
  loadWorks()
})
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>作品库</h2>
    </template>

    <el-tabs v-model="activeTab" class="works-tabs">
      <el-tab-pane label="作品广场" name="gallery" />
      <el-tab-pane label="我的作品" name="mine" />
      <el-tab-pane label="我的收藏" name="favorites" />
    </el-tabs>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索标题或提示词"
        clearable
        class="filter-search"
        @keyup.enter="applyFilters"
        @clear="applyFilters"
      />
      <el-select v-model="featureId" placeholder="全部模式" clearable @change="applyFilters" class="filter-select">
        <el-option v-for="f in featureOptions" :key="f.id" :label="f.label" :value="f.id" />
      </el-select>
      <el-select v-model="tagId" placeholder="全部标签" clearable @change="applyFilters" class="filter-select">
        <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <el-radio-group v-model="sort" @change="applyFilters" size="small">
        <el-radio-button v-for="s in sortOptions" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
      </el-radio-group>
      <el-button :icon="Refresh" @click="loadWorks" circle size="small" />
    </div>

    <!-- 瀑布流 -->
    <div v-loading="loading" class="works-masonry-wrap">
      <div v-if="!loading && works.length === 0" class="works-empty">
        <el-empty :description="activeTab === 'gallery' ? '暂无作品，去发布你的第一件作品吧' : '暂无内容'" />
      </div>
      <div v-else class="works-masonry">
        <div
          v-for="work in works"
          :key="work.id"
          class="work-card"
          @click="openDetail(work)"
        >
          <div class="work-image-wrap">
            <img
              v-if="work.image_url"
              :src="work.image_url"
              :alt="work.title"
              loading="lazy"
              @error="retryOnError($event, work.image_url)"
            />
            <div v-else class="work-image-placeholder">
              <el-icon size="32"><Picture /></el-icon>
            </div>
            <el-tag v-if="work.is_official" type="warning" size="small" class="official-badge">官方</el-tag>
          </div>
          <div class="work-info">
            <div class="work-title">{{ work.title }}</div>
            <div class="work-meta">
              <el-tag size="small" effect="plain">{{ featureLabel(work.feature_id) }}</el-tag>
              <span class="work-model">{{ modelDisplayName(work.model) }}</span>
            </div>
            <div class="work-stats">
              <span class="stat-item">
                <el-icon size="13"><Star /></el-icon>
                {{ work.like_count }}
              </span>
              <span class="stat-item reuse">
                <el-icon size="13"><Refresh /></el-icon>
                {{ work.reuse_count }}
              </span>
              <span class="work-author">{{ work.author?.nickname || work.author?.username || '匿名' }}</span>
              <span class="work-time">{{ toBJMinute(work.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="total > pageSize" class="works-pagination">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next, total"
          background
          @current-change="handlePageChange"
        />
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.works-tabs {
  margin-bottom: 4px;
}
.works-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.filter-search {
  max-width: 240px;
}
.filter-select {
  width: 140px;
}

.works-masonry-wrap {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.works-masonry {
  flex: 1;
  overflow-y: auto;
  column-count: 4;
  column-gap: 14px;
  padding-right: 4px;
}
@media (max-width: 1400px) {
  .works-masonry { column-count: 3; }
}
@media (max-width: 1000px) {
  .works-masonry { column-count: 2; }
}

.works-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.work-card {
  break-inside: avoid;
  margin-bottom: 14px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
  border: 1px solid var(--el-border-color-lighter);
}
.work-card:hover {
  box-shadow: var(--el-box-shadow);
  transform: translateY(-2px);
}

.work-image-wrap {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--el-fill-color);
}
.work-image-wrap img {
  width: 100%;
  display: block;
  object-fit: cover;
}
.work-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--el-text-color-placeholder);
}
.official-badge {
  position: absolute;
  top: 8px;
  left: 8px;
}

.work-info {
  padding: 10px 12px;
}
.work-title {
  font-size: var(--momo-font-size-sm);
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.work-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.work-model {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}
.work-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
}
.stat-item.reuse {
  color: var(--el-color-primary);
}
.work-author {
  margin-left: auto;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-time {
  font-size: var(--momo-font-size-xs);
}

.works-pagination {
  display: flex;
  justify-content: center;
  padding: 16px 0 4px;
}
</style>
