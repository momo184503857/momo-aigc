<script setup lang="ts">
import { computed } from 'vue'
import { Info, TriangleAlert } from '@lucide/vue'
import { useModelCatalogStore } from '@/stores/modelCatalog'
import { UiNumberInput } from '@/components/design-system'
import { Alert, AlertTitle } from '@/components/design-system/primitives/alert'
import { Label } from '@/components/design-system/primitives/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/design-system/primitives/select'
import { Separator } from '@/components/design-system/primitives/separator'
import { Textarea } from '@/components/design-system/primitives/textarea'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const modelCatalog = useModelCatalogStore()
modelCatalog.ensureLoaded()

const availableModels = computed(() =>
  modelCatalog.imageGroups.flatMap((g) => g.models.map((m) => ({
    value: m.id,
    label: m.displayName,
  }))))

const selectedModel = computed(() => {
  if (typeof props.node.config.logicalModelId === 'number') {
    return modelCatalog.getModel(props.node.config.logicalModelId)
  }
  return modelCatalog.getModelByName(String(props.node.config.modelName || ''))
})

/** 模型切换时把分辨率/比例收敛到新模型的合法值（同 patch 一次写入） */
function onModelChange(modelId: number) {
  const model = modelCatalog.getModel(modelId)
  const patch: Record<string, unknown> = { logicalModelId: modelId, modelName: model?.modelId ?? '' }
  if (model) {
    const resolutions = model.capabilities?.resolutions ?? []
    const curSize = String(props.node.config.outputSize || '')
    const newSize = resolutions.includes(curSize) ? curSize : (resolutions[0] ?? curSize)
    if (newSize !== curSize) patch.outputSize = newSize
    const ratios = modelCatalog.aspectRatiosFor(model, newSize)
    const curRatio = String(props.node.config.aspectRatio || '')
    if (ratios.length && !ratios.includes(curRatio)) patch.aspectRatio = ratios[0]
  }
  emit('update', patch)
}

const validAspectRatios = computed(() => {
  const model = selectedModel.value
  if (!model) return ['1:1']
  return modelCatalog.aspectRatiosFor(model, String(props.node.config.outputSize || '2K'))
})

const validResolutions = computed(() => {
  const model = selectedModel.value
  if (!model) return ['2K']
  return model.capabilities?.resolutions ?? ['2K']
})

const imageCount = computed(() => {
  const v = props.node.config.imageCount
  return typeof v === 'number' && v >= 1 && v <= 9 ? v : 3
})

const amendment = computed(() => {
  const v = props.node.config.promptAmendment
  return typeof v === 'string' && v.trim() ? v : ''
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert>
      <Info />
      <AlertTitle>API 密钥已在管理后台统一配置</AlertTitle>
    </Alert>

    <div class="grid gap-1.5">
      <Label>模型名称</Label>
      <Select :model-value="props.node.config.logicalModelId != null ? String(props.node.config.logicalModelId) : ''" @update:model-value="onModelChange(Number($event))">
        <SelectTrigger class="w-full">
          <span class="flex-1 truncate text-left">{{ selectedModel?.displayName ?? (props.node.config.modelName || '选择模型') }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="m in availableModels" :key="m.value" :value="String(m.value)">
            {{ m.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="flex items-center gap-2">
      <Separator class="flex-1" />
      <span class="text-muted-foreground text-xs">生成参数</span>
      <Separator class="flex-1" />
    </div>

    <div class="grid gap-1.5">
      <Label>画幅比例</Label>
      <Select :model-value="String(props.node.config.aspectRatio ?? '')" @update:model-value="emit('update', { aspectRatio: String($event) })">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="r in validAspectRatios" :key="r" :value="String(r)">
            {{ r }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="grid gap-1.5">
      <Label>输出尺寸</Label>
      <Select :model-value="String(props.node.config.outputSize ?? '')" @update:model-value="emit('update', { outputSize: String($event) })">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="res in validResolutions" :key="res" :value="String(res)">
            {{ res }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="flex items-center gap-2">
      <Separator class="flex-1" />
      <span class="text-muted-foreground text-xs">输入端口</span>
      <Separator class="flex-1" />
    </div>

    <div class="grid gap-1.5">
      <Label>参考图数量</Label>
      <UiNumberInput :model-value="imageCount" :min="1" :max="9" @update:model-value="emit('update', { imageCount: $event })" />
    </div>

    <template v-if="amendment">
      <div class="flex items-center gap-2">
        <Separator class="flex-1" />
        <span class="text-muted-foreground text-xs">质检修正</span>
        <Separator class="flex-1" />
      </div>
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>本节点带有质检回写的修正指令，将在下次生成时拼接到提示词末尾；生成成功后自动清空。</AlertTitle>
      </Alert>
      <Textarea :model-value="amendment" :rows="4" @update:model-value="emit('update', { promptAmendment: String($event) })" />
    </template>
  </div>
</template>
