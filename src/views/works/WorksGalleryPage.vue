<script setup lang="ts">
/**
 * WorksGalleryPage - 作品库广场。
 * 瀑布流展示 + 滚动到底部自动加载（懒加载），支持按范围/模式/标签筛选、关键词搜索、排序。
 * 卡片上可直接点赞 / 收藏 / 一键同款，无需进入详情。
 */
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { worksApi } from '@/services/worksApi'
import type { WorkItem, WorkListParams } from '@/services/worksApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import { Search, Star, StarFilled, Collection, CollectionTag, Refresh, MagicStick, Picture, Loading, Pointer, CopyDocument } from '@element-plus/icons-vue'

defineOptions({ name: 'WorksGalleryPage' })

const router = useRouter()
const { error, info, success } = useUiFeedback()
const { retryOnError } = useImageRetry()

const scope = ref<'gallery' | 'mine' | 'favorites'>('gallery')
const loading = ref(false)
const works = ref<WorkItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(24)
const noMore = ref(false) // 已加载到末尾
const loadingMore = ref(false) // 正在加载下一页

// 筛选
const sort = ref<'latest' | 'hot' | 'most_reused'>('latest')
const featureId = ref('')
const tagId = ref<number | undefined>(undefined)
const keyword = ref('')

const tags = ref<{ id: number; name: string; usage_count: number }[]>([])

const scopeOptions = [
  { value: 'gallery', label: '全部' },
  { value: 'mine', label: '我提交的' },
  { value: 'favorites', label: '我的收藏' },
]

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

// 懒加载哨兵元素 & IntersectionObserver
const sentinelRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function loadWorks() {
  loading.value = true
  page.value = 1
  noMore.value = false
  try {
    const params: WorkListParams = {
      page: page.value,
      pageSize: pageSize.value,
      sort: sort.value,
      scope: scope.value,
    }
    if (featureId.value) params.feature_id = featureId.value
    if (tagId.value) params.tag_id = tagId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()

    const res = await worksApi.list(params)
    works.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
    noMore.value = works.value.length >= total.value
  } catch (e) {
    error(e, '加载作品列表失败')
  } finally {
    loading.value = false
    nextTick(setupObserver)
  }
}

async function loadMore() {
  if (loadingMore.value || noMore.value || loading.value) return
  loadingMore.value = true
  try {
    const nextPage = page.value + 1
    const params: WorkListParams = {
      page: nextPage,
      pageSize: pageSize.value,
      sort: sort.value,
      scope: scope.value,
    }
    if (featureId.value) params.feature_id = featureId.value
    if (tagId.value) params.tag_id = tagId.value
    if (keyword.value.trim()) params.keyword = keyword.value.trim()

    const res = await worksApi.list(params)
    const records = res.data.data?.records || []
    works.value.push(...records)
    page.value = nextPage
    total.value = res.data.data?.total || 0
    noMore.value = works.value.length >= total.value
  } catch (e) {
    error(e, '加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

// 设置 IntersectionObserver 监听哨兵元素
function setupObserver() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  const el = sentinelRef.value
  if (!el) return
  // 找到滚动容器（.page-content）
  const root = el.closest('.page-content') as HTMLElement | null
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) loadMore()
    },
    { root, rootMargin: '300px', threshold: 0 },
  )
  observer.observe(el)
}

function applyFilters() {
  loadWorks()
}

function openDetail(work: WorkItem) {
  router.push(`/works/${work.id}`)
}

// 卡片内操作（阻止冒泡，避免触发 openDetail）
async function toggleLike(work: WorkItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await worksApi.like(work.id)
    work.is_liked = res.data.data.is_liked
    work.like_count = res.data.data.like_count
  } catch (e) {
    error(e, '操作失败')
  }
}

async function toggleFavorite(work: WorkItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await worksApi.favorite(work.id)
    work.is_favorited = res.data.data.is_favorited
    work.favorite_count = res.data.data.favorite_count
    success(work.is_favorited ? '已收藏' : '已取消收藏')
  } catch (e) {
    error(e, '操作失败')
  }
}

function copyPrompt(work: WorkItem, e: Event) {
  e.stopPropagation()
  if (!work.prompt) return
  navigator.clipboard.writeText(work.prompt).then(() => success('已复制提示词')).catch(() => error(new Error(), '复制失败，请手动复制'))
}

async function handleReuse(work: WorkItem, e: Event) {
  e.stopPropagation()
  try {
    const res = await worksApi.reuse(work.id)
    const data = res.data.data
    const featureId = data.feature_id
    const isPhotography = featureId === 'ai-photography'
    const isFreeGen = !featureId || featureId === 'free-gen'
    const targetRoutePath = isPhotography ? '/photography' : isFreeGen ? '/free-gen' : '/workspace'

    sessionStorage.setItem('regenerate_task', JSON.stringify({
      model: data.model,
      prompt: data.prompt,
      resolution: data.resolution,
      aspectRatio: data.aspectRatio,
      userPrompt: data.userPrompt || '',
      input_image_urls: data.input_image_urls || [],
      feature_id: featureId,
    }))
    router.push(targetRoutePath)
    info(
      isPhotography ? '已跳转到AI摄影，参数已复制'
      : isFreeGen ? '已跳转到自由生图，请点击生成按钮'
      : '已跳转到工作台，请点击生成按钮'
    )
  } catch (e) {
    error(e, '一键同款失败')
  }
}

onMounted(() => {
  loadTags()
  loadWorks()
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

async function loadTags() {
  try {
    const res = await worksApi.tags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>作品库</h2>
    </template>

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
      <el-select v-model="scope" @change="applyFilters" class="filter-select">
        <el-option v-for="s in scopeOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-select v-model="featureId" placeholder="全部模式" clearable @change="applyFilters" class="filter-select">
        <el-option v-for="f in featureOptions" :key="f.id" :label="f.label" :value="f.id" />
      </el-select>
      <el-select v-model="tagId" placeholder="全部标签" clearable @change="applyFilters" class="filter-select">
        <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <el-button :icon="Refresh" @click="loadWorks" circle size="small" />
    </div>

    <!-- 排序栏 -->
    <div class="sort-bar">
      <span class="sort-label">排序：</span>
      <el-radio-group v-model="sort" @change="applyFilters" size="small">
        <el-radio-button v-for="s in sortOptions" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 瀑布流 -->
    <div v-loading="loading" class="works-masonry-wrap">
      <div v-if="!loading && works.length === 0" class="works-empty">
        <el-empty :description="scope === 'gallery' ? '暂无作品，去发布你的第一件作品吧' : '暂无内容'" />
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
              alt="作品图片"
              loading="lazy"
              @error="retryOnError($event, work.image_url)"
            />
            <div v-else class="work-image-placeholder">
              <el-icon size="32"><Picture /></el-icon>
            </div>
            <el-tag v-if="work.is_official" type="warning" size="small" class="official-badge">官方</el-tag>
          </div>
          <div class="work-info">
            <div class="card-actions" @click.stop>
              <div class="action-cell">
                <button
                  class="action-btn"
                  :class="{ 'is-active': work.is_liked }"
                  :title="work.is_liked ? '取消今日点赞' : '点赞（每天可赞一次）'"
                  @click="toggleLike(work, $event)"
                >
                  <span class="action-top"><el-icon size="15"><StarFilled v-if="work.is_liked" /><Pointer v-else /></el-icon><span>赞</span></span>
                </button>
                <span class="action-num">{{ work.like_count }}</span>
              </div>
              <div class="action-cell">
                <button
                  class="action-btn"
                  :class="{ 'is-active': work.is_favorited }"
                  :title="work.is_favorited ? '取消收藏' : '收藏'"
                  @click="toggleFavorite(work, $event)"
                >
                  <span class="action-top"><el-icon size="15"><CollectionTag v-if="work.is_favorited" /><Collection v-else /></el-icon><span>收藏</span></span>
                </button>
              </div>
              <div class="action-cell">
                <button
                  class="action-btn"
                  title="一键同款"
                  @click="handleReuse(work, $event)"
                >
                  <span class="action-top"><el-icon size="15"><CopyDocument /></el-icon><span>同款</span></span>
                </button>
                <span class="action-num">{{ work.reuse_count }}</span>
              </div>
              <div class="action-cell">
                <button
                  class="action-btn copy-prompt-btn"
                  title="复制提示词"
                  @click="copyPrompt(work, $event)"
                >
                  <span class="action-top"><el-icon size="15"><CopyDocument /></el-icon><span>复制</span></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 懒加载哨兵 + 加载状态 -->
      <div v-if="works.length > 0" class="load-more-zone">
        <div ref="sentinelRef" class="sentinel"></div>
        <div v-if="loadingMore" class="loading-more">
          <el-icon class="is-loading" size="16"><Loading /></el-icon>
          <span>加载中…</span>
        </div>
        <div v-else-if="noMore" class="no-more">没有更多了</div>
      </div>
    </div>
  </PageLayout>
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
  max-width: 240px;
}
.filter-select {
  width: 140px;
}

.sort-bar {
  display: flex;
  align-items: center;
  padding-bottom: 16px;
  margin-bottom: 16px;
}
.sort-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  margin-right: 8px;
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
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  padding-right: 4px;
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

/* 卡片操作按钮（数字在按钮下方、按钮外） */
.card-actions {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  flex-wrap: wrap;
}
.action-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
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
  font-size: var(--momo-font-size-base);
}
.action-num {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  line-height: 1;
}

.work-info {
  padding: 10px 12px;
}
.copy-prompt-btn {
  flex-shrink: 0;
}
/* 懒加载区域 */
.load-more-zone {
  padding: 16px 0 4px;
  min-height: 40px;
}
.sentinel {
  height: 1px;
}
.loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: var(--momo-font-size-sm);
}
.no-more {
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: var(--momo-font-size-xs);
  padding: 8px 0;
}
</style>
