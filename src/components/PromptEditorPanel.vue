<script setup lang="ts">
/**
 * PromptEditorPanel — 可折叠的提示词编辑面板
 *
 * 支持多段提示词（如 AI 摄影的各元素提示词）和单段系统提示词。
 * 所有编辑仅在父组件会话内生效，不持久化到服务器。
 */
import { ref, computed } from 'vue'
import { ArrowDown, RefreshRight } from '@element-plus/icons-vue'

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

function updateSection(key: string, value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function handleReset() {
  emit('reset')
}

function sectionValue(key: string): string {
  return props.modelValue[key] ?? ''
}
</script>

<template>
  <div class="prompt-editor-panel">
    <div class="panel-header" @click="expanded = !expanded">
      <div class="panel-title">
        <el-icon class="panel-chevron" :class="{ rotated: expanded }">
          <ArrowDown />
        </el-icon>
        <span>{{ title || '提示词详情' }}</span>
      </div>
      <span class="panel-hint">{{ expanded ? '点击收起' : '点击展开查看/编辑' }}</span>
    </div>

    <div v-show="expanded" class="panel-body">
      <div v-for="section in sections" :key="section.key" class="section-row">
        <label class="section-label">{{ section.label }}</label>
        <el-input
          :model-value="sectionValue(section.key)"
          type="textarea"
          :rows="rows"
          placeholder="请输入提示词"
          @update:model-value="updateSection(section.key, $event)"
        />
      </div>

      <div class="section-row">
        <div class="final-label-row">
          <label class="section-label">最终提示词</label>
          <span class="final-hint">实际发送给模型的完整 prompt</span>
        </div>
        <el-input
          :model-value="finalPrompt"
          type="textarea"
          :rows="rows"
          readonly
          class="final-prompt-input"
        />
      </div>

      <div class="panel-actions">
        <el-button size="small" :icon="RefreshRight" @click="handleReset">
          恢复默认
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prompt-editor-panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--momo-radius-md);
  background: var(--el-fill-color-blank);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
  background: var(--el-fill-color-light);
}
.panel-header:hover {
  background: var(--el-fill-color);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--momo-font-size-sm);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-chevron {
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-secondary);
  transition: transform 0.25s;
}
.panel-chevron.rotated {
  transform: rotate(180deg);
}

.panel-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
}

.panel-body {
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  font-weight: 500;
}

.final-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.final-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
}

.final-prompt-input :deep(.el-textarea__inner) {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}
</style>
