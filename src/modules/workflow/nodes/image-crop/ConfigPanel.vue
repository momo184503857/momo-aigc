<script setup lang="ts">
import { computed } from 'vue'
import { Info } from '@lucide/vue'
import { UiNumberInput } from '@/components/ui'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const ratioOptions = [
  { value: '1:1', label: '1:1（方图）' },
  { value: '3:4', label: '3:4（竖版主图）' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16（竖版长图）' },
  { value: '16:9', label: '16:9' },
  { value: 'custom', label: '自定义' },
]

const ratio = computed(() => {
  const v = props.node.config.ratio
  return typeof v === 'string' && ratioOptions.some((o) => o.value === v) ? v : '3:4'
})

const customW = computed(() => {
  const v = props.node.config.customW
  return typeof v === 'number' && v > 0 ? v : 3
})

const customH = computed(() => {
  const v = props.node.config.customH
  return typeof v === 'number' && v > 0 ? v : 4
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert>
      <Info />
      <AlertTitle>确定性居中裁切：保持较长边不变，两侧等量裁掉多余部分。不缩放、不用 AI 重绘。</AlertTitle>
    </Alert>

    <div class="grid gap-1.5">
      <Label>目标比例</Label>
      <Select :model-value="ratio" @update:model-value="emit('update', { ratio: String($event) })">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="o in ratioOptions" :key="o.value" :value="String(o.value)">
            {{ o.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <template v-if="ratio === 'custom'">
      <div class="grid gap-1.5">
        <Label>自定义宽高（W:H）</Label>
        <div class="flex items-center gap-2">
          <UiNumberInput :model-value="customW" :min="1" :max="9999" @update:model-value="emit('update', { customW: $event })" />
          <span class="text-muted-foreground">:</span>
          <UiNumberInput :model-value="customH" :min="1" :max="9999" @update:model-value="emit('update', { customH: $event })" />
        </div>
      </div>
    </template>
  </div>
</template>
