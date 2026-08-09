<script setup lang="ts">
/**
 * WorkDetailPage - 作品详情页（沉浸式大图 + 卡片参数）。
 * 左：大图区域（可点击放大预览）+ 图下操作浮层（点赞/收藏/一键同款/复制）。
 * 右：卡片式参数面板（作者卡 / 生成参数 / 参考图 / 提示词结构 / 完整提示词 / 标签）。
 * 「一键同款」复用 sessionStorage 机制跳转对应生图页。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { worksApi } from '@/services/worksApi'
import type { WorkItem, PromptSegments } from '@/services/worksApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useImageRetry } from '@/composables/useImageRetry'
import { useImagePreview } from '@/composables/useImagePreview'
import { useAuthStore } from '@/stores/auth'
import { FEATURE_CONFIGS, getFeatureLabel } from '@/configs/featureConfig'
import { MODELS } from '@/types/adapter'
import { toBJMinute } from '@/utils/datetime'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import {
  ArrowLeft, Star, StarFilled, CopyDocument, Delete, MagicStick, Picture,
  Collection, CollectionTag, Pointer, View, Refresh, Edit, Check,
} from '@element-plus/icons-vue'

defineOptions({ name: 'WorkDetailPage' })

const route = useRoute()
const router = useRouter()
const { success, info, warning, error, confirmDanger } = useUiFeedback()
const { retryOnError } = useImageRetry()
const { visible: previewVisible, url: previewUrl, open: openPreview } = useImagePreview()
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
// 发布人或管理员可编辑备注
const canRemark = computed(() => isOwner.value || auth.isAdmin)

const remarkEditing = ref(false)
const remarkDraft = ref('')
const remarkSaving = ref(false)

function startRemarkEdit() {
  remarkDraft.value = work.value?.remark || ''
  remarkEditing.value = true
}

async function saveRemark() {
  if (!work.value) return
  remarkSaving.value = true
  try {
    const res = await worksApi.updateRemark(work.value.id, remarkDraft.value)
    work.value.remark = res.data.data.remark
    remarkEditing.value = false
    success('备注已保存')
  } catch (e) {
    error(e, '保存备注失败')
  } finally {
    remarkSaving.value = false
  }
}

function cancelRemark() {
  remarkEditing.value = false
}

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
    success(work.value.is_favorited ? '已收藏' : '已取消收藏')
  } catch (e) {
    error(e, '操作失败')
  }
}

// 一键同款：复用 sessionStorage 机制
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
        <el-button v-if="isOwner" :icon="Delete" type="danger" plain size="small" class="header-delete" @click="handleDelete">删除</el-button>
      </div>
    </template>

    <div v-loading="loading" class="detail-body">
      <template v-if="work">
        <div class="detail-layout">
          <!-- 左：沉浸式大图 -->
          <div class="detail-left">
            <div class="image-stage" @click="work.image_url && openPreview(work.image_url)">
              <img
                v-if="work.image_url"
                :src="work.image_url"
                alt="作品图片"
                @error="retryOnError($event, work.image_url)"
              />
              <div v-else class="detail-image-placeholder">
                <el-icon size="48"><Picture /></el-icon>
              </div>
              <el-tag v-if="work.is_official" type="warning" class="official-badge">官方</el-tag>
              <div v-if="work.image_url" class="image-zoom-hint"><el-icon><View /></el-icon> 点击查看大图</div>
            </div>
          </div>

          <!-- 右：卡片式参数面板 -->
          <div class="detail-right">
            <!-- 作者卡 + 统计 + 操作 -->
            <div class="info-card author-card">
              <div class="author-top">
                <div class="author-avatar">{{ authorName().charAt(0).toUpperCase() }}</div>
                <div class="author-detail">
                  <div class="author-name">{{ authorName() }}</div>
                </div>
                <div class="author-actions">
                  <el-button
                    size="small"
                    type="primary"
                    :plain="work.is_liked"
                    @click="toggleLike"
                  >
                    <el-icon><StarFilled v-if="work.is_liked" /><Pointer v-else /></el-icon>
                    <span>赞 {{ work.like_count }}</span>
                  </el-button>
                  <el-button
                    size="small"
                    type="primary"
                    :plain="work.is_favorited"
                    @click="toggleFavorite"
                  >
                    <el-icon><CollectionTag v-if="work.is_favorited" /><Collection v-else /></el-icon>
                    <span>收藏</span>
                  </el-button>
                  <el-button size="small" type="primary" :icon="MagicStick" @click="handleReuse" class="reuse-cta">一键同款</el-button>
                </div>
              </div>
              <div class="stats-row">
                <span class="stat"><el-icon><Star /></el-icon>{{ work.like_count }}</span>
                <span class="stat"><el-icon><Collection /></el-icon>{{ work.favorite_count }}</span>
                <span class="stat"><el-icon><Refresh /></el-icon>{{ work.reuse_count }}</span>
                <span class="stat"><el-icon><View /></el-icon>{{ work.view_count }}</span>
                <span class="stat-time">{{ toBJMinute(work.created_at) }}</span>
              </div>
            </div>

            <!-- 生成参数 -->
            <div class="info-card">
              <div class="card-title">生成参数</div>
              <div class="param-grid">
                <div class="param-cell">
                  <span class="param-label">模式</span>
                  <el-tag size="small" effect="plain">{{ getFeatureLabel(work.feature_id || 'free-gen') }}</el-tag>
                </div>
                <div class="param-cell">
                  <span class="param-label">模型</span>
                  <span class="param-value">{{ modelDisplayName(work.model) }}</span>
                </div>
                <div class="param-cell">
                  <span class="param-label">分辨率</span>
                  <span class="param-value">{{ work.resolution || '-' }}</span>
                </div>
                <div class="param-cell">
                  <span class="param-label">宽高比</span>
                  <span class="param-value">{{ work.aspect_ratio || '-' }}</span>
                </div>
              </div>
            </div>

            <!-- 参考图 -->
            <div v-if="work.reference_image_urls?.length" class="info-card">
              <div class="card-title">参考图（{{ work.reference_image_urls.length }}）</div>
              <div class="ref-images">
                <div
                  v-for="(url, i) in work.reference_image_urls"
                  :key="i"
                  class="ref-image-item"
                  @click="openPreview(url)"
                >
                  <img :src="url" :alt="`参考图${i + 1}`" @error="retryOnError($event, url)" />
                </div>
              </div>
            </div>

            <!-- 提示词结构 -->
            <div v-if="hasSegments" class="info-card">
              <div class="card-title">提示词结构</div>
              <div class="segments-grid">
                <div v-for="seg in segmentLabels" :key="seg.key" class="segment-item" :class="{ filled: work.prompt_segments[seg.key]?.trim() }">
                  <span class="segment-label">{{ seg.label }}</span>
                  <span v-if="work.prompt_segments[seg.key]?.trim()" class="segment-value">{{ work.prompt_segments[seg.key] }}</span>
                  <span v-else class="segment-empty">未设置</span>
                </div>
              </div>
            </div>

            <!-- 完整提示词 -->
            <div class="info-card">
              <div class="card-title-row">
                <span class="card-title">完整提示词</span>
                <el-button text size="small" :icon="CopyDocument" @click="copyPrompt">复制</el-button>
              </div>
              <div class="prompt-box">{{ work.prompt }}</div>
            </div>

            <!-- 备注（发布人/管理员可编辑） -->
            <div class="info-card remark-card">
              <div class="card-title-row">
                <span class="card-title">备注</span>
                <el-button
                  v-if="canRemark && !remarkEditing"
                  text
                  size="small"
                  :icon="Edit"
                  @click="startRemarkEdit"
                >编辑</el-button>
              </div>
              <!-- 查看态 -->
              <div v-if="!remarkEditing" class="card-text remark-text" :class="{ empty: !work.remark }">
                {{ work.remark || (canRemark ? '暂无备注，点击「编辑」添加' : '暂无备注') }}
              </div>
              <!-- 编辑态 -->
              <div v-else class="remark-edit">
                <el-input
                  v-model="remarkDraft"
                  type="textarea"
                  :rows="3"
                  maxlength="500"
                  show-word-limit
                  placeholder="添加备注"
                  resize="none"
                />
                <div class="remark-edit-actions">
                  <el-button size="small" @click="cancelRemark">取消</el-button>
                  <el-button size="small" type="primary" :icon="Check" :loading="remarkSaving" @click="saveRemark">保存</el-button>
                </div>
              </div>
            </div>

            <!-- 负面词 -->
            <div v-if="work.negative_prompt" class="info-card">
              <div class="card-title">负向规避词</div>
              <div class="prompt-box negative">{{ work.negative_prompt }}</div>
            </div>

            <!-- 标签 -->
            <div v-if="work.tags?.length" class="info-card">
              <div class="card-title">标签</div>
              <div class="work-tags">
                <el-tag v-for="t in work.tags" :key="t.id" size="small" effect="plain">{{ t.name }}</el-tag>
              </div>
            </div>
          </div>
        </div>
      </template>
      <el-empty v-else-if="!loading" description="作品不存在或已下架" />
    </div>

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
  </PageLayout>
</template>

<style scoped>
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-delete {
  flex-shrink: 0;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
}

.detail-layout {
  display: flex;
  gap: var(--momo-space-6);
  align-items: flex-start;
}

/* ─── 左：沉浸式大图 ─── */
.detail-left {
  flex: 0 0 480px;
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-4);
}

.image-stage {
  position: relative;
  border-radius: var(--momo-radius-lg);
  overflow: hidden;
  background: var(--momo-color-bg-muted);
  border: 1px solid var(--momo-color-border-soft);
  cursor: zoom-in;
  box-shadow: var(--momo-shadow-sm);
  transition: box-shadow var(--momo-transition-base);
}
.image-stage:hover {
  box-shadow: var(--momo-shadow-md);
}
.image-stage img {
  width: 100%;
  display: block;
  max-height: 620px;
  object-fit: contain;
}
.detail-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 320px;
  color: var(--momo-color-text-placeholder);
}
.official-badge {
  position: absolute;
  top: 12px;
  left: 12px;
}
.image-zoom-hint {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--momo-radius-full);
  background: var(--momo-color-overlay);
  color: var(--momo-color-text-inverse);
  font-size: var(--momo-font-size-xs);
  opacity: 0;
  transition: opacity var(--momo-transition-base);
}
.image-stage:hover .image-zoom-hint {
  opacity: 1;
}

/* 操作按钮已合并到右侧作者卡 */
.action-row {
  display: flex;
  gap: var(--momo-space-2);
  flex-wrap: wrap;
}
.action-row .el-button {
  margin-left: 0;
}

/* ─── 右：卡片式参数面板 ─── */
.detail-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-4);
}

.info-card {
  background: var(--momo-color-bg);
  border: 1px solid var(--momo-color-border-soft);
  border-radius: var(--momo-radius-lg);
  padding: var(--momo-space-4);
  box-shadow: var(--momo-shadow-sm);
}
.card-title {
  font-size: var(--momo-font-size-sm);
  font-weight: 600;
  color: var(--momo-color-text-secondary);
  margin-bottom: var(--momo-space-3);
}
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--momo-space-3);
}
.card-title-row .card-title {
  margin-bottom: 0;
}
.card-text {
  font-size: var(--momo-font-size-base);
  color: var(--momo-color-text);
  line-height: 1.6;
}

/* 备注卡 */
.remark-text.empty {
  color: var(--momo-color-text-placeholder);
  font-size: var(--momo-font-size-sm);
}
.remark-edit {
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-3);
}
.remark-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--momo-space-2);
}
.remark-edit-actions .el-button {
  margin-left: 0;
}

/* 作者卡 */
.author-card {
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-3);
}
.author-top {
  display: flex;
  align-items: center;
  gap: var(--momo-space-3);
}
.author-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: var(--momo-color-text-inverse);
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
  color: var(--momo-color-text);
}
.author-actions {
  display: flex;
  align-items: center;
  gap: var(--momo-space-2);
  flex-shrink: 0;
}
.author-actions .el-button {
  margin-left: 0;
}
.reuse-cta {
  flex-shrink: 0;
}
/* 统计行（作者卡内） */
.stats-row {
  display: flex;
  align-items: center;
  gap: var(--momo-space-4);
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-tertiary);
  padding-top: var(--momo-space-2);
  border-top: 1px solid var(--momo-color-border-soft);
}
.stats-row .stat {
  display: flex;
  align-items: center;
  gap: 4px;
}
.stat-time {
  margin-left: auto;
}

/* 生成参数网格 */
.param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--momo-space-3);
}
.param-cell {
  display: flex;
  align-items: center;
  gap: var(--momo-space-2);
}
.param-label {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-tertiary);
  width: 48px;
  flex-shrink: 0;
}
.param-value {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text);
}

/* 参考图 */
.ref-images {
  display: flex;
  gap: var(--momo-space-2);
  flex-wrap: wrap;
}
.ref-image-item {
  width: 84px;
  height: 84px;
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  border: 1px solid var(--momo-color-border-soft);
  cursor: zoom-in;
  transition: transform var(--momo-transition-fast);
}
.ref-image-item:hover {
  transform: scale(1.04);
}
.ref-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 提示词结构 */
.segments-grid {
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-2);
}
.segment-item {
  display: flex;
  align-items: flex-start;
  gap: var(--momo-space-3);
  padding: 6px 10px;
  border-radius: var(--momo-radius-md);
  background: var(--momo-color-bg-muted);
}
.segment-item.filled {
  background: var(--momo-color-brand-subtle);
}
.segment-label {
  width: 48px;
  flex-shrink: 0;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-tertiary);
  padding-top: 2px;
}
.segment-value {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text);
  line-height: 1.5;
}
.segment-empty {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-placeholder);
}

/* 提示词框 */
.prompt-box {
  background: var(--momo-color-bg-muted);
  border-radius: var(--momo-radius-md);
  padding: var(--momo-space-3) var(--momo-space-4);
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.prompt-box.negative {
  color: var(--momo-color-danger);
  background: var(--momo-color-danger-subtle);
}

/* 标签 */
.work-tags {
  display: flex;
  gap: var(--momo-space-2);
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
