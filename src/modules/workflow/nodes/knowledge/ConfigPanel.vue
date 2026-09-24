<script setup lang="ts">
import { computed } from 'vue'
import { Label } from '@/components/design-system/primitives/label'
import { RadioGroup, RadioGroupItem } from '@/components/design-system/primitives/radio-group'
import { Textarea } from '@/components/design-system/primitives/textarea'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const content = computed(() => {
  const v = props.node.config.content
  return typeof v === 'string' ? v : ''
})

const mergeMode = computed(() =>
  props.node.config.mergeMode === 'upstream-first' ? 'upstream-first' : 'rules-first'
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid gap-1.5">
      <Label>知识库内容（规则、背景基调、检查清单等大段文本）</Label>
      <Textarea
        :model-value="content"
        :rows="14"
        placeholder="例如：主图背景基调统一规则、动作多样性与证据规则、质检标准…"
        @update:model-value="emit('update', { content: String($event) })"
      />
    </div>

    <div class="grid gap-1.5">
      <Label>与上游文本的合并顺序</Label>
      <RadioGroup :model-value="mergeMode" @update:model-value="emit('update', { mergeMode: String($event) })">
        <div class="flex items-center gap-2">
          <RadioGroupItem id="merge-rules-first" value="rules-first" />
          <Label for="merge-rules-first" class="font-normal">知识库在前</Label>
        </div>
        <div class="flex items-center gap-2">
          <RadioGroupItem id="merge-upstream-first" value="upstream-first" />
          <Label for="merge-upstream-first" class="font-normal">上游在前</Label>
        </div>
      </RadioGroup>
    </div>
  </div>
</template>
