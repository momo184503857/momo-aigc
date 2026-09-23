<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
      <div class="col-span-full">
        <Label class="mb-1 gap-1 text-(--momo-color-text-secondary)">{{ themeLabel }} <span class="text-destructive">*</span></Label>
        <div class="flex gap-2">
          <!-- TODO(allow-create-select)：原 EP 下拉 filterable+allow-create（选择或自由输入），shadcn Select 无对应物，用 Input + datalist 按原语义实现 -->
          <Input
            v-model="form.theme"
            list="df-options-theme"
            class="flex-1"
            placeholder="选择或输入，如：新中式 / 法式田园"
          />
          <datalist id="df-options-theme">
            <option v-for="o in optionsOf('theme')" :key="String(o)" :value="String(o)" />
          </datalist>
          <Button @click="emit('reason')">🧠 智能推理补全</Button>
        </div>
      </div>
      <div v-for="f in selectFields" :key="f.key">
        <Label class="mb-1 gap-1 text-(--momo-color-text-secondary)">
          {{ f.label }} <Badge v-if="autoFilled[f.key]" variant="warning">推理</Badge>
        </Label>
        <Input
          v-model="form[f.key]"
          :list="`df-options-${f.key}`"
          placeholder="选择或输入"
        />
        <datalist :id="`df-options-${f.key}`">
          <option v-for="o in optionsOf(f.key)" :key="String(o)" :value="String(o)" />
        </datalist>
      </div>
      <div v-for="f in textFields" :key="f.key">
        <Label class="mb-1 text-(--momo-color-text-secondary)">{{ f.label }}</Label>
        <Textarea v-model="form[f.key]" :rows="2" placeholder="自由描述" />
      </div>
    </div>
    <div class="flex gap-2">
      <Button size="sm" variant="outline" @click="emit('feedback', true)">👍 本次推理精准</Button>
      <Button size="sm" variant="outline" @click="emit('feedback', false)">👎 需修正</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
