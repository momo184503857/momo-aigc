<script setup lang="ts">
import DsActionBar from './DsActionBar.vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../primitives/select'
const props = withDefaults(defineProps<{
  label: string; busyLabel?: string; disabled?: boolean; busy?: boolean; reason?: string
  reasonTone?: 'default' | 'error'; reasonDisplay?: 'inline' | 'tooltip'
  modelId?: number; models?: { value: number; label: string; description?: string }[]; modelsLoading?: boolean
  aspectRatio?: string; aspectRatios?: string[]; count?: number; countOptions?: number[]
  taskCount?: number; resolution?: string; resolutions?: string[]
  /** dock 用于无内边距的工作区；inset 用于已由页面外壳提供留白的区域。 */
  placement?: 'inset' | 'dock'
}>(), {
  reasonDisplay: 'tooltip', models: () => [], aspectRatios: () => [], resolutions: () => [],
  countOptions: () => [1, 2, 3, 4, 5], count: 1, placement: 'inset',
})
const emit = defineEmits<{
  submit: []; 'update:modelId': [value: number]; 'model-change': [value: number]
  'update:aspectRatio': [value: string]; 'update:count': [value: number]
  'update:resolution': [value: string]; 'resolution-change': [value: string]
}>()
function selectModel(value: string) {
  const id = Number(value)
  if (!props.models.some(model => model.value === id)) return
  emit('update:modelId', id)
  emit('model-change', id)
}
function selectResolution(value: string) {
  emit('update:resolution', value)
  emit('resolution-change', value)
}
</script>
<template>
  <div class="ds-parameter-host" :class="{ 'ds-parameter-dock': placement === 'dock' }">
    <section class="ds-panel ds-parameters" aria-label="参数区">
      <div class="ds-parameter-grid">
        <div class="ds-parameter">
          <span class="ds-caption">模型</span>
          <Select :model-value="modelId ? String(modelId) : ''" :disabled="modelsLoading || !models.length" @update:model-value="selectModel(String($event))">
            <SelectTrigger aria-label="模型"><span class="min-w-0 flex-1 truncate text-left">{{ models.find(m => m.value === modelId)?.label || (modelsLoading ? '加载中…' : '选择模型') }}</span></SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem v-for="model in models" :key="model.value" :value="String(model.value)">
                <span class="ds-parameter-model-option"><span>{{ model.label }}</span><span v-if="model.description" class="ds-caption">{{ model.description }}</span></span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">画面比例</span>
          <Select :model-value="aspectRatio" :disabled="!aspectRatios.length" @update:model-value="emit('update:aspectRatio', String($event))">
            <SelectTrigger aria-label="画面比例"><SelectValue placeholder="选择宽高比" /></SelectTrigger>
            <SelectContent position="popper" align="start"><SelectItem v-for="ratio in aspectRatios" :key="ratio" :value="ratio">{{ ratio }}</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">{{ taskCount !== undefined ? '任务数量' : '生成数量' }}</span>
          <output v-if="taskCount !== undefined" class="ds-parameter-value tabular-nums" aria-label="任务数量">{{ taskCount }} 个</output>
          <Select v-else :model-value="String(count)" @update:model-value="emit('update:count', Number($event))">
            <SelectTrigger aria-label="生成数量"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" align="start"><SelectItem v-for="n in countOptions" :key="n" :value="String(n)">{{ n }} 张</SelectItem></SelectContent>
          </Select>
        </div>
        <div class="ds-parameter">
          <span class="ds-caption">分辨率</span>
          <Select :model-value="resolution" :disabled="!resolutions.length" @update:model-value="selectResolution(String($event))">
            <SelectTrigger aria-label="分辨率"><SelectValue placeholder="选择分辨率" /></SelectTrigger>
            <SelectContent position="popper" align="start"><SelectItem v-for="r in resolutions" :key="r" :value="r">{{ r }}</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <DsActionBar full-width :label="label" :busy-label="busyLabel" :busy="busy" :disabled="disabled" :reason="reason" :reason-tone="reasonTone" :reason-display="reasonDisplay" @submit="emit('submit')" />
      <div v-if="$slots.after" class="ds-parameter-after"><slot name="after" /></div>
    </section>
  </div>
</template>
