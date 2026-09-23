<script setup lang="ts">
import { computed } from 'vue'
import { Info } from '@lucide/vue'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'
import { useModelCatalogStore } from '@/stores/modelCatalog'

const modelCatalog = useModelCatalogStore()
modelCatalog.ensureLoaded()

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

function val(key: string, fallback = ''): string {
  const v = props.node.config[key]
  return typeof v === 'string' ? v : fallback
}
function boolVal(key: string): boolean {
  return Boolean(props.node.config[key])
}

/** 触发器显示：按 id 反查模型显示名；查不到时回退展示旧数据的 modelName */
const selectedModelName = computed(() => {
  if (typeof props.node.config.channelModelId === 'number') {
    return modelCatalog.getModel(props.node.config.channelModelId)?.displayName ?? ''
  }
  return ''
})

/** 模型切换写入数字 id，并同步 modelName 供旧链路兜底/摘要展示 */
function onModelChange(modelId: number) {
  const model = modelCatalog.getModel(modelId)
  emit('update', { channelModelId: modelId, modelName: model?.modelId ?? '' })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert>
      <Info />
      <AlertTitle>API 密钥已在管理后台统一配置</AlertTitle>
    </Alert>

    <div class="grid gap-1.5">
      <Label>模型名称</Label>
      <Select
        :model-value="props.node.config.channelModelId != null ? String(props.node.config.channelModelId) : ''"
        @update:model-value="onModelChange(Number($event))"
      >
        <SelectTrigger class="w-full">
          <span class="flex-1 truncate text-left">{{ selectedModelName || (props.node.config.modelName || '选择文字模型') }}</span>
        </SelectTrigger>
        <SelectContent>
          <template v-if="modelCatalog.loaded">
            <SelectGroup v-for="group in modelCatalog.textGroups" :key="group.providerId">
              <SelectLabel>{{ group.providerName }}</SelectLabel>
              <SelectItem
                v-for="m in group.models"
                :key="m.id"
                :value="String(m.id)"
              >
                {{ m.displayName }}
              </SelectItem>
            </SelectGroup>
          </template>
        </SelectContent>
      </Select>
    </div>

    <div class="flex items-center gap-2">
      <Separator class="flex-1" />
      <span class="text-muted-foreground text-xs">节点提示词</span>
      <Separator class="flex-1" />
    </div>

    <div class="grid gap-1.5">
      <Label>任务指令</Label>
      <Textarea :model-value="val('taskPrompt')" :rows="5" placeholder="例如：你是电商主图提示词生成专家..." @update:model-value="emit('update', { taskPrompt: String($event) })" />
    </div>

    <div class="grid gap-1.5">
      <Label>补充细节</Label>
      <Textarea :model-value="val('detailPrompt')" :rows="5" placeholder="例如：商品是黑色连衣裙，目标人群是..." @update:model-value="emit('update', { detailPrompt: String($event) })" />
    </div>

    <div class="flex items-center gap-2">
      <Switch :model-value="boolVal('pauseAfterRun')" @update:model-value="emit('update', { pauseAfterRun: Boolean($event) })" />
      <Label>运行后暂停确认</Label>
    </div>

    <div class="flex items-center gap-2">
      <Separator class="flex-1" />
      <span class="text-muted-foreground text-xs">高级参数</span>
      <Separator class="flex-1" />
    </div>

    <div class="grid gap-1.5">
      <Label>温度 (Temperature)</Label>
      <Input :model-value="(props.node.config.temperature as string | number | undefined) ?? ''" placeholder="0.0 - 2.0，留空使用默认" @update:model-value="emit('update', { temperature: $event ? Number($event) : undefined })" />
    </div>

    <div class="grid gap-1.5">
      <Label>最大 Tokens</Label>
      <Input :model-value="(props.node.config.maxTokens as string | number | undefined) ?? ''" placeholder="如 4096，留空使用默认" @update:model-value="emit('update', { maxTokens: $event ? Number($event) : undefined })" />
    </div>
  </div>
</template>
