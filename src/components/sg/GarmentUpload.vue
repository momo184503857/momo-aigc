<template>
  <div class="sg-garment-upload">
    <div class="upload-block">
      <div class="block-label">
        ① 服装主图（正面全身/七分服装图，必填）
        <span v-if="analysis" class="analysis-chip" :style="{ background: analysis.dominantColor }" />
        <span v-if="analysis" class="analysis-text">主色 {{ analysis.dominantColor }} · {{ analysis.colorFamily }}</span>
      </div>
      <ImageSlotUpload
        label="服装主图"
        :max-count="1"
        :required="true"
        :model-value="mainImages"
        :size="140"
        @update:model-value="onMain"
      />
    </div>
    <div class="upload-block">
      <div class="block-label">② 细节参考图（袖口/印花/裙摆/面料/领口，选填，最多 {{ maxDetail }} 张）</div>
      <ImageSlotUpload
        label="细节图"
        :max-count="maxDetail"
        :required="false"
        :model-value="detailImages"
        :size="120"
        @update:model-value="onDetail"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import ImageSlotUpload, { type SlotImage } from '@/components/ImageSlotUpload.vue'
import { analyzeImage, type ImageAnalysis } from '@/utils/imageAnalysis'

defineOptions({ name: 'SgGarmentUpload' })

const props = withDefaults(defineProps<{
  main: SlotImage[]
  detail: SlotImage[]
  maxDetail?: number
  analysis?: ImageAnalysis | null
}>(), { maxDetail: 6 })

const emit = defineEmits<{
  'update:main': [imgs: SlotImage[]]
  'update:detail': [imgs: SlotImage[]]
  'analyzed': [a: ImageAnalysis]
}>()

const mainImages = computed(() => props.main)
const detailImages = computed(() => props.detail)

function onMain(imgs: SlotImage[]) {
  emit('update:main', imgs)
}

function onDetail(imgs: SlotImage[]) {
  emit('update:detail', imgs)
}

// 主图变化 → 自动分析主色/亮度/构图
watch(() => props.main[0]?.file, async (file) => {
  if (!file) return
  try {
    const result = await analyzeImage(file)
    emit('analyzed', result)
  } catch { /* 分析失败不阻塞流程 */ }
}, { immediate: true })
</script>

<style scoped>
.sg-garment-upload { display: flex; flex-direction: column; gap: var(--momo-space-4); }
.upload-block { display: flex; flex-direction: column; gap: var(--momo-space-2); }
.block-label {
  font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary);
  display: flex; align-items: center; gap: var(--momo-space-2);
}
.analysis-chip {
  width: 14px; height: 14px; border-radius: var(--momo-radius-full);
  border: 1px solid var(--momo-color-border);
}
.analysis-text { color: var(--momo-color-text-tertiary); font-size: var(--momo-font-size-xs); }
</style>
