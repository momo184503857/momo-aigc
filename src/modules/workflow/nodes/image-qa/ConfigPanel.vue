<script setup lang="ts">
import { computed } from 'vue'
import { Info } from '@lucide/vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const modelCatalog = useModelCatalogStore()
modelCatalog.ensureLoaded()

const visionModels = computed(() =>
  modelCatalog.visionTextModels.map((m) => ({ value: m.id, label: m.displayName }))
)
const noVisionModel = computed(() => visionModels.value.length === 0)

const qaPrompt = computed(() => {
  const v = props.node.config.qaPrompt
  return typeof v === 'string' ? v : ''
})

const strict = computed(() => props.node.config.strict === true)

function onModelChange(modelId: number) {
  const model = modelCatalog.getModel(modelId)
  emit('update', { channelModelId: modelId, modelName: model?.modelId ?? '' })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert>
      <Info />
      <AlertTitle>识图模型对全部输入图组检；不合格时自动生成修正指令并重跑对应生图节点（最多 2 轮）。</AlertTitle>
    </Alert>

    <div class="grid gap-1.5">
      <Label>识图模型{{ noVisionModel ? '（暂无支持识图的模型，将退用普通文字模型，结果可能不可靠）' : '' }}</Label>
      <Select
        :model-value="props.node.config.channelModelId != null ? String(props.node.config.channelModelId) : ''"
        @update:model-value="onModelChange(Number($event))"
      >
        <SelectTrigger class="w-full">
          <SelectValue placeholder="选择识图模型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="m in visionModels" :key="m.value" :value="String(m.value)">
            {{ m.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="grid gap-1.5">
      <Label>质检提示词（检查清单）</Label>
      <Textarea
        :model-value="qaPrompt"
        :rows="10"
        @update:model-value="emit('update', { qaPrompt: String($event) })"
      />
    </div>

    <div class="flex items-center gap-2">
      <Switch
        :model-value="strict"
        @update:model-value="emit('update', { strict: Boolean($event) })"
      />
      <Label>严格模式（重试耗尽仍不合格则置失败）</Label>
    </div>
  </div>
</template>
