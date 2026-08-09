<script setup lang="ts">
/**
 * WorkDetailPage - 作品详情页。
 * 左：大图 + 作者 + 互动栏（点赞/收藏/一键同款）。
 * 右：完整参数面板（模式/模型/分辨率/参考图/prompt/结构化字段/负面词）。
 * 「一键同款」复用 handleCopyParams 的 sessionStorage 机制跳转对应生图页。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { worksApi } from '@/services/worksApi'
import type { WorkItem, PromptSegments } from '@/services/worksApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { useAuthStore } from '@/stores/auth'
import { FEATURE_CONFIGS, getFeatureLabel } from '@/configs/featureConfig'
import { MODELS } from '@/types/adapter'
import { toBJMinute } from '@/utils/datetime'
import {
  ArrowLeft, Star, StarFilled, CopyDocument, Delete, Refresh, MagicStick, Picture,
} from '@element-plus/icons-vue'

defineOptions({ name: 'WorkDetailPage' })

const route = useRoute()
const router = useRouter()
const { success, info, warning, error, confirmDanger } = useUiFeedback()
const { retryOnError } = useImageRetry()
const auth = useAuthStore()

const work = ref<WorkItem | null>(null)
const loading = ref(false)

// 结构化字段定义
const segmentLabels: { key: keyof PromptSegments; label: string }[] = [
  { key: 'subject', label: '主体' },
  { key: 'style', label: '风格' },
  { key: 'scene', label: '场景' },
  { key: 'lighting', label: '光影' },
  { key: 'composition', label: '构图' },
  { key: 'quality', label: '画质' },
]

const hasSegments = computed(() => {
  const s = work.value?.prompt_segments
  if (!s) return false
  return segmentLabels.some(({ key }) => s[key]?.trim())
})

function modelDisplayName(modelId: string): string {
  return MODELS.find((m) => m.id === modelId)?.name || modelId
}

function authorName(): string {
  const a = work.value?.author
  return a?.nickname || a?.username || '匿名'
}

const isOwner = computed(() => work.value?.user_id === auth.user?.id)

async function loadWork() {
  loading.value = true
  try {
    const res = await worksApi.detail(route.params.id as string)
    work.value = res.data.data
  } catch (e) {
    error(e, '加载作品详情失败')
  } finally {
    loading.value = false
  }
}

async function toggleLike() {
  if (!work.value) return
  try {
    const res = await worksApi.like(work.value.id)
    work.value.is_liked = res.data.data.is_liked
    work.value.like_count = res.data.data.like_count
  } catch (e) {
    error(e, '操作失败')
  }
}

async function toggleFavorite() {
  if (!work.value) return
  try {
    const res = await worksApi.favorite(work.value.id)
    work.value.is_favorited = res.data.data.is_favorited
    work.value.favorite_count = res.data.data.favorite_count
  } catch (e) {
    error(e, '操作失败')
  }
}

// 一键同款：复用 handleCopyParams 的 sessionStorage 机制
async function handleReuse() {
  if (!work.value) return
  try {
    const res = await worksApi.reuse(work.value.id)
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

function copyPrompt() {
  if (!work.value?.prompt) return
  navigator.clipboard.writeText(work.value.prompt).then(() => success('已复制提示词')).catch(() => warning('复制失败，请手动复制'))
}

async function handleDelete() {
  if (!work.value) return
  try {
    await confirmDanger({ title: '确认删除', message: '确定要删除这件作品吗？删除后不可恢复。', confirmText: '删除', cancelText: '取消' })
    await worksApi.delete(work.value.id)
    success('作品已删除')
    router.push('/works')
  } catch { /* cancelled */ }
}

onMounted(loadWork)
</script>

<template>
  <PageLayout>
    <template #header>
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="router.push('/works')">返回作品库</el-button>
        <h2 class="detail-title">{{ work?.title || '作品详情' }}</h2>
      </div>
    </template>

    <div v-loading="loading" class="detail-body">
      <template v-if="work">
        <div class="detail-layout">
          <!-- 左：大图 + 互动 -->
          <div class="detail-left">
            <div class="detail-image-wrap">
              <img
                v-if="work.image_url"
                :src="work.image_url"
                :alt="work.title"
                @error="retryOnError($event, work.image_url)"
              />
              <div v-else class="detail-image-placeholder">
                <el-icon size="48"><Picture /></el-icon>
              </div>
              <el-tag v-if="work.is_official" type="warning" class="detail-official-badge">官方</el-tag>
            </div>

            <!-- 互动栏 -->
            <div class="interaction-bar">
              <el-button
                :type="work.is_liked ? 'primary' : 'default'"
                :icon="work.is_liked ? StarFilled : Star"
                @click="toggleLike"
              >
                {{ work.like_count }}
              </el-button>
              <el-button
                :type="work.is_favorited ? 'warning' : 'default'"
                :icon="work.is_favorited ? StarFilled : Star"
                @click="toggleFavorite"
              >
                {{ work.is_favorited ? '已收藏' : '收藏' }}
              </el-button>
              <el-button type="primary" :icon="MagicStick" @click="handleReuse" class="reuse-btn">
                一键同款
              </el-button>
              <el-button :icon="CopyDocument" @click="copyPrompt">复制提示词</el-button>
              <el-button v-if="isOwner" :icon="Delete" type="danger" plain @click="handleDelete">删除</el-button>
            </div>

            <!-- 作者信息 -->
            <div class="author-info">
              <div class="author-avatar">{{ authorName().charAt(0).toUpperCase() }}</div>
              <div class="author-detail">
                <div class="author-name">{{ authorName() }}</div>
                <div class="work-meta-line">
                  <span>复用 {{ work.reuse_count }} 次</span>
                  <span>浏览 {{ work.view_count }} 次</span>
                  <span>{{ toBJMinute(work.created_at) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 右：参数面板 -->
          <div class="detail-right">
            <!-- 描述 -->
            <div v-if="work.description" class="param-section">
              <div class="param-section-title">作品描述</div>
              <div class="param-description">{{ work.description }}</div>
            </div>

            <!-- 基本参数 -->
            <div class="param-section">
              <div class="param-section-title">生成参数</div>
              <div class="param-grid">
                <div class="param-item">
                  <span class="param-label">模式</span>
                  <el-tag size="small" effect="plain">{{ getFeatureLabel(work.feature_id || 'free-gen') }}</el-tag>
                </div>
                <div class="param-item">
                  <span class="param-label">模型</span>
                  <span class="param-value">{{ modelDisplayName(work.model) }}</span>
                </div>
                <div class="param-item">
                  <span class="param-label">分辨率</span>
                  <span class="param-value">{{ work.resolution || '-' }}</span>
                </div>
                <div class="param-item">
                  <span class="param-label">宽高比</span>
                  <span class="param-value">{{ work.aspect_ratio || '-' }}</span>
                </div>
              </div>
            </div>

            <!-- 参考图 -->
            <div v-if="work.reference_image_urls?.length" class="param-section">
              <div class="param-section-title">参考图（{{ work.reference_image_urls.length }}）</div>
              <div class="ref-images">
                <div v-for="(url, i) in work.reference_image_urls" :key="i" class="ref-image-item">
                  <img :src="url" :alt="`参考图${i + 1}`" @error="retryOnError($event, url)" />
                </div>
              </div>
            </div>

            <!-- 结构化字段 -->
            <div v-if="hasSegments" class="param-section">
              <div class="param-section-title">提示词结构</div>
              <div class="segments-grid">
                <div v-for="seg in segmentLabels" :key="seg.key" class="segment-item">
                  <span class="segment-label">{{ seg.label }}</span>
                  <span v-if="work.prompt_segments[seg.key]?.trim()" class="segment-value">{{ work.prompt_segments[seg.key] }}</span>
                  <span v-else class="segment-empty">—</span>
                </div>
              </div>
            </div>

            <!-- 完整提示词 -->
            <div class="param-section">
              <div class="param-section-title">完整提示词</div>
              <div class="prompt-box">{{ work.prompt }}</div>
            </div>

            <!-- 负面词 -->
            <div v-if="work.negative_prompt" class="param-section">
              <div class="param-section-title">负向规避词</div>
              <div class="prompt-box negative">{{ work.negative_prompt }}</div>
            </div>

            <!-- 标签 -->
            <div v-if="work.tags?.length" class="param-section">
              <div class="param-section-title">标签</div>
              <div class="work-tags">
                <el-tag v-for="t in work.tags" :key="t.id" size="small">{{ t.name }}</el-tag>
              </div>
            </div>
          </div>
        </div>
      </template>
      <el-empty v-else-if="!loading" description="作品不存在或已下架" />
    </div>
  </PageLayout>
</template>

<style scoped>
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.detail-title {
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  margin: 0;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
}

.detail-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.detail-left {
  flex: 0 0 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-image-wrap {
  position: relative;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color-lighter);
}
.detail-image-wrap img {
  width: 100%;
  display: block;
  max-height: 600px;
  object-fit: contain;
}
.detail-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--el-text-color-placeholder);
}
.detail-official-badge {
  position: absolute;
  top: 12px;
  left: 12px;
}

.interaction-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.interaction-bar .reuse-btn {
  flex: 1;
  min-width: 140px;
}

.author-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md);
}
.author-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: var(--el-color-white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  flex-shrink: 0;
}
.author-detail {
  flex: 1;
  min-width: 0;
}
.author-name {
  font-weight: 600;
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-primary);
}
.work-meta-line {
  display: flex;
  gap: 12px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}

.detail-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.param-section {
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 16px;
}
.param-section:last-child {
  border-bottom: none;
}
.param-section-title {
  font-size: var(--momo-font-size-sm);
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.param-description {
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.param-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
  width: 56px;
  flex-shrink: 0;
}
.param-value {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-primary);
}

.ref-images {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.ref-image-item {
  width: 80px;
  height: 80px;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
}
.ref-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.segments-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.segment-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.segment-label {
  width: 56px;
  flex-shrink: 0;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
  padding-top: 2px;
}
.segment-value {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-primary);
  line-height: 1.5;
}
.segment-empty {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
}

.prompt-box {
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-sm);
  padding: 12px 14px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.prompt-box.negative {
  color: var(--el-color-danger-light-3);
}

.work-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

@media (max-width: 1000px) {
  .detail-layout {
    flex-direction: column;
  }
  .detail-left {
    flex: none;
    width: 100%;
  }
}
</style>
