<script setup lang="ts">
import { Info } from '@lucide/vue'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'

const props = defineProps<{ node: WorkflowNode }>()
const emit = defineEmits<{ update: [patch: Record<string, unknown>] }>()

const saveDir = typeof props.node.config.saveDir === 'string' ? props.node.config.saveDir : ''
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert>
      <Info />
      <AlertTitle>保存目录为项目级配置，修改后所有保存节点共用。</AlertTitle>
    </Alert>

    <div class="grid gap-1.5">
      <Label>保存目录</Label>
      <Input :model-value="saveDir" placeholder="未设置，运行时将弹出选择框" readonly />
    </div>
  </div>
</template>
