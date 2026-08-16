<template>
  <div class="sg-decompose-form">
    <div class="df-grid">
      <div class="df-field df-theme">
        <div class="f-label">{{ themeLabel }} <span class="req">*</span></div>
        <div class="theme-row">
          <el-select
            v-model="form.theme"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入，如：新中式 / 法式田园"
            style="flex:1"
          >
            <el-option v-for="o in optionsOf('theme')" :key="String(o)" :value="String(o)" :label="String(o)" />
          </el-select>
          <el-button type="primary" plain @click="emit('reason')">🧠 智能推理补全</el-button>
        </div>
      </div>
      <div v-for="f in selectFields" :key="f.key" class="df-field">
        <div class="f-label">{{ f.label }} <el-tag v-if="autoFilled[f.key]" size="small" type="warning" effect="plain">推理</el-tag></div>
        <el-select
          v-model="form[f.key]"
          filterable allow-create default-first-option clearable
          placeholder="选择或输入"
        >
          <el-option v-for="o in optionsOf(f.key)" :key="String(o)" :value="String(o)" :label="String(o)" />
        </el-select>
      </div>
      <div v-for="f in textFields" :key="f.key" class="df-field">
        <div class="f-label">{{ f.label }}</div>
        <el-input v-model="form[f.key]" type="textarea" :rows="2" placeholder="自由描述" />
      </div>
    </div>
    <div class="df-actions">
      <el-button size="small" @click="emit('feedback', true)">👍 本次推理精准</el-button>
      <el-button size="small" @click="emit('feedback', false)">👎 需修正</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { DECOMPOSE_FIELDS } from '@/utils/decomposeSpec'

defineOptions({ name: 'SgDecomposeForm18' })

export interface DecomposeFormValue {
  theme: string
  [key: string]: string
}

const props = defineProps<{
  modelValue: DecomposeFormValue
  fieldOptions: Record<string, unknown[]>
  autoFilled: Record<string, boolean>
}>()

const emit = defineEmits<{
  'update:modelValue': [v: DecomposeFormValue]
  reason: []
  feedback: [ok: boolean]
}>()

/** 18 项 = 16 项知识库下拉 + 2 项自由文本（字段规格见 utils/decomposeSpec.ts） */
const selectFields = DECOMPOSE_FIELDS.filter((f) => f.kind === 'select' && f.key !== 'theme')
const textFields = DECOMPOSE_FIELDS.filter((f) => f.kind === 'text')
const themeLabel = DECOMPOSE_FIELDS.find((f) => f.key === 'theme')!.label

const form = reactive<DecomposeFormValue>({ ...props.modelValue })
for (const f of DECOMPOSE_FIELDS) {
  if (form[f.key] === undefined) form[f.key] = ''
}

watch(form, () => emit('update:modelValue', { ...form }), { deep: true })
watch(() => props.modelValue, (v) => {
  for (const f of DECOMPOSE_FIELDS) {
    if (v[f.key] !== undefined && form[f.key] !== v[f.key]) form[f.key] = v[f.key]
  }
}, { deep: true })

function optionsOf(key: string): unknown[] {
  return props.fieldOptions[key] || []
}
</script>

<style scoped>
.sg-decompose-form { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.df-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--momo-space-3); }
.df-theme { grid-column: 1 / -1; }
.theme-row { display: flex; gap: var(--momo-space-2); }
.f-label { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); margin-bottom: var(--momo-space-1); display: flex; align-items: center; gap: var(--momo-space-1); }
.req { color: var(--momo-color-danger); }
.df-actions { display: flex; gap: var(--momo-space-2); }
</style>
