<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

function val(key: string, fallback = ''): string {
  const v = props.node.config[key]
  return typeof v === 'string' ? v : fallback
}
function boolVal(key: string, fallback = true): boolean {
  const v = props.node.config[key]
  return v !== undefined ? Boolean(v) : fallback
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid gap-1.5">
      <Label>分隔符</Label>
      <Input :model-value="val('delimiter', '---')" placeholder="---" @update:model-value="emit('update', { delimiter: String($event) })" />
    </div>

    <div class="flex items-center gap-2">
      <Switch :model-value="boolVal('trimWhitespace')" @update:model-value="emit('update', { trimWhitespace: Boolean($event) })" />
      <Label>去除首尾空白</Label>
    </div>

    <div class="flex items-center gap-2">
      <Switch :model-value="boolVal('ignoreEmpty')" @update:model-value="emit('update', { ignoreEmpty: Boolean($event) })" />
      <Label>忽略空段落</Label>
    </div>
  </div>
</template>
