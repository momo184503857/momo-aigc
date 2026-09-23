<script setup lang="ts">
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

function updateText(value: string) {
  emit('update', { text: value })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid gap-1.5">
      <Label>文本内容</Label>
      <Textarea
        :model-value="typeof props.node.config.text === 'string' ? props.node.config.text : ''"
        :rows="10"
        placeholder="输入商品信息、卖点或补充说明"
        @update:model-value="updateText(String($event))"
      />
    </div>
  </div>
</template>
