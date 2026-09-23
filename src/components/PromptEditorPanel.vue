<script setup lang="ts">
/**
 * PromptEditorPanel — 可折叠的提示词编辑面板
 *
 * 支持多段提示词（如 AI 摄影的各元素提示词）和单段系统提示词。
 * 所有编辑仅在父组件会话内生效，不持久化到服务器。
 */
import { ref, computed } from 'vue'
import { ChevronDown, RotateCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export interface PromptSectionDef {
  key: string
  label: string
}

const props = defineProps<{
  title?: string
  modelValue: Record<string, string>
  sections: PromptSectionDef[]
  finalPrompt: string
  defaultValue?: Record<string, string>
  rows?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>]
  reset: []
}>()

const expanded = ref(false)
const rows = computed(() => props.rows ?? 4)

function updateSection(key: string, value: string | number) {
  emit('update:modelValue', { ...props.modelValue, [key]: String(value) })
}

function handleReset() {
  emit('reset')
}

function sectionValue(key: string): string {
  return props.modelValue[key] ?? ''
}
</script>

<template>
  <div class="border-border-light overflow-hidden rounded-md border">
    <div
      class="bg-muted/60 hover:bg-muted flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors select-none"
      @click="expanded = !expanded"
    >
      <div class="text-foreground flex items-center gap-2 text-sm font-semibold">
        <ChevronDown
          class="text-muted-foreground size-4 transition-transform duration-250"
          :class="{ 'rotate-180': expanded }"
        />
        <span>{{ title || '提示词详情' }}</span>
      </div>
      <span class="text-muted-foreground/70 text-xs">{{ expanded ? '点击收起' : '点击展开查看/编辑' }}</span>
    </div>

    <div v-show="expanded" class="flex flex-col gap-3.5 px-3 py-3.5">
      <div v-for="section in sections" :key="section.key" class="flex flex-col gap-1.5">
        <label class="text-foreground/80 text-sm font-medium">{{ section.label }}</label>
        <Textarea
          :model-value="sectionValue(section.key)"
          :rows="rows"
          placeholder="请输入提示词"
          @update:model-value="updateSection(section.key, $event)"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <label class="text-foreground/80 text-sm font-medium">最终提示词</label>
          <span class="text-muted-foreground/70 text-xs">实际发送给模型的完整 prompt</span>
        </div>
        <Textarea
          :model-value="finalPrompt"
          :rows="rows"
          readonly
          class="bg-muted/60 text-foreground/80"
        />
      </div>

      <div class="flex justify-end pt-1">
        <Button size="sm" variant="outline" @click="handleReset">
          <RotateCw />
          恢复默认
        </Button>
      </div>
    </div>
  </div>
</template>
