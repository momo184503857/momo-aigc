<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, SlidersHorizontal, Sparkles } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MODES, modeLabel, slotsFor, type Draft, type Mode } from './model'
import ReferenceSlot from './ReferenceSlot.vue'

const props = defineProps<{ mode: Mode; draft: Draft; imageUrls: Record<string, string>; uploading: boolean; ready: boolean }>()
const emit = defineEmits<{ mode: [mode: Mode]; upload: [files: FileList, slot: string]; generate: [] }>()
const slots = computed(() => slotsFor(props.mode))
const primarySlots = computed(() => slots.value.filter(slot => slot.key !== 'supplementary'))
const supplementarySlot = computed(() => slots.value.find(slot => slot.key === 'supplementary'))
const descriptions: Record<Mode, string> = {
  'free-gen': '参考图片，写下灵感，创造你想要的画面。',
  'change-clothes': '为模特更换服装，保持自然真实的效果。',
  'change-bg': '换一个场景，保留模特与服装的细节。',
  'change-face': '上传目标图与源脸图，自然融合人物五官。',
  'detail-pic': '从商品图片中，发现值得放大的细节。',
  'fabric-pic': '近一点，展现面料的纹理与质感。',
  'flat-pic': '让商品以干净、自然的平铺方式呈现。',
  '3d-pic': '从商品图片出发，探索立体展示效果。',
  'model-gen': '描述人物、气质与场景，创造你的模特。',
  'three-view': '从正面参考出发，生成多角度人物视图。',
}
</script>

<template>
  <aside class="studio-composer" aria-label="创作输入">
    <div class="composer-scroll">
      <div class="composer-heading">
      <h1>{{ modeLabel(mode) }}</h1>
      <div class="mode-select">
        <label for="creation-mode" class="sr-only">创作模式</label>
        <select id="creation-mode" :value="mode" @change="emit('mode', ($event.target as HTMLSelectElement).value as Mode)">
          <option v-for="item in MODES" :key="item" :value="item">{{ modeLabel(item) }}</option>
        </select>
        <ChevronDown :size="15" aria-hidden="true" />
      </div>
      </div>
      <p class="composer-description">{{ descriptions[mode] }}</p>

      <div v-if="primarySlots.length" class="reference-grid">
        <ReferenceSlot v-for="slot in primarySlots" :key="`${mode}-${slot.key}`"
          :slot-config="slot" :references="draft.references" :image-urls="imageUrls"
          :disabled="uploading || !ready" :class="{ 'reference-multiple': slot.maxCount > 1 }"
          @upload="files => emit('upload', files, slot.key)"
          @remove="id => draft.references = draft.references.filter(r => r.id !== id)" />
      </div>
      <details v-if="supplementarySlot" class="supplementary-section">
        <summary>补充图片 <span>可选 · {{ draft.references.filter(r => r.slot === 'supplementary').length }} / 6</span><ChevronDown :size="14" /></summary>
        <ReferenceSlot :slot-config="supplementarySlot" :references="draft.references" :image-urls="imageUrls"
          :disabled="uploading || !ready" @upload="files => emit('upload', files, 'supplementary')"
          @remove="id => draft.references = draft.references.filter(r => r.id !== id)" />
      </details>

      <div class="prompt-section">
        <div class="field-heading"><label for="creation-prompt">画面描述</label></div>
        <Textarea id="creation-prompt" v-model="draft.prompt" class="studio-prompt" placeholder="描述你的灵感。主体、场景、光线，或是一种你喜欢的感觉…" :maxlength="4000" />
        <div class="prompt-count">{{ draft.prompt.length }} / 4000</div>
      </div>

      <details class="advanced-settings">
        <summary><SlidersHorizontal :size="14" /> 更多设置 <ChevronDown :size="13" /></summary>
        <label>不希望出现的内容<Textarea v-model="draft.negative" placeholder="如：模糊、多余的装饰" :maxlength="1000" /></label>
      </details>
    </div>
    <div class="composer-footer">
      <div class="parameter-grid">
        <label class="model-field">模型<select v-model="draft.model"><option>标准画质 · 演示</option><option>精细画质 · 演示</option></select></label>
        <label>画面比例<select v-model="draft.ratio"><option>1:1</option><option>3:4</option><option>4:3</option><option>9:16</option><option>16:9</option></select></label>
        <label>生成数量<select v-model.number="draft.count"><option v-for="count in 4" :key="count" :value="count">{{ count }} 张</option></select></label>
        <label>分辨率<select v-model="draft.resolution"><option>1K</option><option>2K</option><option>4K</option></select></label>
      </div>
      <Button class="generate-button" :disabled="!ready || uploading" @click="emit('generate')"><Sparkles :size="20" /><span>{{ uploading ? '正在添加图片' : mode === 'change-clothes' ? '开始换装' : '生成图片' }}</span></Button>
    </div>
  </aside>
</template>
