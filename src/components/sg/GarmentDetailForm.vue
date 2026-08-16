<template>
  <div class="sg-garment-detail">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="四层结构描述用于锁定服装细节，防止 AI 丢配饰、把复杂版型画简单。可根据特征速选自动预填。"
    />
    <div class="fields">
      <div class="field">
        <div class="f-label">版型轮廓</div>
        <el-input v-model="form.shape" type="textarea" :rows="2" placeholder="如：宽松直筒连衣裙，及踝长度，落肩袖" />
      </div>
      <div class="field">
        <div class="f-label">面料层次</div>
        <el-input v-model="form.fabric" type="textarea" :rows="2" placeholder="如：外层香云纱+内衬真丝，立体肌理提花" />
      </div>
      <div class="field">
        <div class="f-label">结构细节</div>
        <el-input v-model="form.structure" type="textarea" :rows="2" placeholder="如：侧边高开叉，腰部褶皱收腰，前片拼接" />
      </div>
      <div class="field">
        <div class="f-label">专属元素</div>
        <el-input v-model="form.element" type="textarea" :rows="2" placeholder="如：手工盘扣五枚，袖口刺绣缠枝纹" />
      </div>
      <div class="field">
        <div class="f-label">印花/图案描述（防印花改变）</div>
        <el-input v-model="form.printText" type="textarea" :rows="2" placeholder="如：水墨晕染印花，位于裙摆，禁止改变图案走向" />
      </div>
      <div class="field">
        <div class="f-label">服装自带配饰清单（必须保留）</div>
        <el-input v-model="form.accessories" type="textarea" :rows="2" placeholder="如：自带丝巾一条（保留）、腰间系带、水滴扣耳环" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { GarmentInfo } from '@/utils/promptEngine'

defineOptions({ name: 'SgGarmentDetailForm' })

const props = defineProps<{ modelValue: GarmentInfo['detail4'] & Pick<GarmentInfo, 'printText' | 'accessories'> }>()
const emit = defineEmits<{ 'update:modelValue': [v: typeof form] }>()

const form = reactive({
  shape: props.modelValue?.shape || '',
  fabric: props.modelValue?.fabric || '',
  structure: props.modelValue?.structure || '',
  element: props.modelValue?.element || '',
  printText: props.modelValue?.printText || '',
  accessories: props.modelValue?.accessories || '',
})

watch(form, () => emit('update:modelValue', { ...form }), { deep: true })
watch(() => props.modelValue, (v) => {
  if (!v) return
  for (const k of Object.keys(form) as Array<keyof typeof form>) {
    if (v[k] && form[k] !== v[k]) form[k] = v[k] as string
  }
}, { deep: true })

defineExpose({ form })
</script>

<style scoped>
.sg-garment-detail { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--momo-space-3); }
.f-label { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); margin-bottom: var(--momo-space-1); }
</style>
