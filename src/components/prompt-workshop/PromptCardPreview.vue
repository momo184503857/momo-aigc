<script setup lang="ts">
/**
 * PromptCardPreview - 卡片预览弹窗（多图）。
 * 左：大图 + 缩略图条（点击切换主图、左右翻页、主图点击放大）。
 * 右：模块标签 + 完整内容 + 备注 + 作者 + 统计行 + 复用按钮。
 */
import { ref, computed, watch } from 'vue'
import { useImagePreview } from '@/composables/useImagePreview'
import { useUiFeedback } from '@/composables/useUiFeedback'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import { promptCardsApi, type PromptCardItem } from '@/services/promptCardsApi'
import { ArrowLeft, ArrowRight, Star, CollectionTag, CopyDocument } from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
  card: PromptCardItem | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'reuse', card: PromptCardItem): void
}>()

const { success, warning, error } = useUiFeedback()
const { visible: bigVisible, url: bigUrl, open: openBig } = useImagePreview()

const activeIdx = ref(0)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const images = computed(() => props.card?.images || [])
const currentUrl = computed(() => images.value[activeIdx.value] || '')

// 打开新卡片时，默认显示置顶图
watch(() => props.card?.id, (id) => {
  if (id && props.card) {
    activeIdx.value = props.card.cover_index || 0
  }
})

function prev() {
  if (images.value.length <= 1) return
  activeIdx.value = (activeIdx.value - 1 + images.value.length) % images.value.length
}
function next() {
  if (images.value.length <= 1) return
  activeIdx.value = (activeIdx.value + 1) % images.value.length
}
function selectIdx(idx: number) {
  activeIdx.value = idx
}
function openMain() {
  if (currentUrl.value) openBig(currentUrl.value)
}

async function handleReuse() {
  if (!props.card) return
  try {
    await promptCardsApi.reuse(props.card.id)
    success('已复用到拼接预览')
    emit('reuse', props.card)
    visible.value = false
  } catch (e) {
    error(e, '复用失败')
  }
}

function copyContent() {
  if (!props.card?.content) return
  navigator.clipboard.writeText(props.card.content)
    .then(() => success('已复制提示词'))
    .catch(() => warning('复制失败，请手动复制'))
}
</script>

<template>
  <el-dialog v-model="visible" width="720px" :show-close="true" class="card-preview-dialog" align-center>
    <div v-if="card" class="preview-layout">
      <!-- 左：大图区 -->
      <div class="preview-left">
        <div class="main-image-wrap">
          <img
            v-if="currentUrl"
            :src="currentUrl"
            alt="预览图"
            class="main-image"
            @click="openMain"
          />
          <div v-if="images.length > 1" class="nav-btn nav-prev" @click="prev">
            <el-icon size="18"><ArrowLeft /></el-icon>
          </div>
          <div v-if="images.length > 1" class="nav-btn nav-next" @click="next">
            <el-icon size="18"><ArrowRight /></el-icon>
          </div>
          <div v-if="images.length > 1" class="image-counter">{{ activeIdx + 1 }} / {{ images.length }}</div>
        </div>
        <div v-if="images.length > 1" class="thumbs">
          <div
            v-for="(img, idx) in images"
            :key="idx"
            class="thumb"
            :class="{ active: idx === activeIdx }"
            @click="selectIdx(idx)"
          >
            <img :src="img" alt="缩略图" />
          </div>
        </div>
      </div>

      <!-- 右：信息区 -->
      <div class="preview-right">
        <div class="right-top">
          <el-tag v-if="card.module" :type="card.module.type === 'forbidden' ? 'danger' : card.module.type === 'requirement' ? 'warning' : 'primary'" effect="plain">
            {{ card.module.name }}
          </el-tag>
          <el-tag v-if="card.is_official" type="warning" size="small">官方</el-tag>
        </div>

        <div class="content-box">{{ card.content }}</div>

        <div v-if="card.remark" class="remark-box">
          <span class="remark-label">备注</span>
          <span class="remark-text">{{ card.remark }}</span>
        </div>

        <div class="stat-row">
          <span class="stat"><el-icon><Star /></el-icon> {{ card.like_count }}</span>
          <span class="stat"><el-icon><CollectionTag /></el-icon> {{ card.favorite_count }}</span>
          <span class="stat"><el-icon><CopyDocument /></el-icon> {{ card.reuse_count }}</span>
          <span class="author-name">{{ card.author?.nickname || card.author?.username || '匿名' }}</span>
        </div>

        <div class="action-row">
          <el-button @click="copyContent" :icon="CopyDocument">复制内容</el-button>
          <el-button type="primary" :icon="CopyDocument" @click="handleReuse">复用到拼接预览</el-button>
        </div>
      </div>
    </div>
  </el-dialog>

  <UiImagePreview v-model="bigVisible" :url="bigUrl" />
</template>

<style scoped>
.preview-layout {
  display: flex;
  gap: 20px;
  padding: 4px 4px 0;
}
.preview-left {
  flex: 0 0 360px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.main-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: var(--el-fill-color);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
}
.main-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: zoom-in;
}
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s;
}
.nav-btn:hover {
  opacity: 1;
}
.nav-prev { left: 8px; }
.nav-next { right: 8px; }
.image-counter {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: var(--momo-font-size-xs);
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 8px;
  border-radius: var(--momo-radius-sm);
}
.thumbs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.thumb {
  flex: 0 0 56px;
  height: 56px;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  opacity: 0.7;
  transition: opacity 0.15s, border-color 0.15s;
}
.thumb.active {
  border-color: var(--el-color-primary);
  opacity: 1;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.right-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.content-box {
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-primary);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 12px 14px;
}
.remark-box {
  display: flex;
  gap: 8px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.remark-label {
  flex-shrink: 0;
  font-weight: 600;
}
.remark-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.stat-row {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
}
.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}
.author-name {
  margin-left: auto;
  color: var(--el-text-color-placeholder);
}
.action-row {
  display: flex;
  gap: 10px;
  margin-top: auto;
  padding-top: 8px;
}

@media (max-width: 720px) {
  .preview-layout {
    flex-direction: column;
  }
  .preview-left {
    flex: none;
    width: 100%;
  }
}
</style>
