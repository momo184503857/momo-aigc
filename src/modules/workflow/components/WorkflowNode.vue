<script setup lang="ts">
import { computed, onUnmounted, ref, useTemplateRef } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import * as Icons from '@element-plus/icons-vue'
import type { Component } from 'vue'
import type { ImageNodeResultValue, LocalImageAsset, WorkflowCanvasNodeData } from '@/modules/workflow/types/workflow'
import { useWorkflowStore } from '@/modules/workflow/stores/workflowStore'
import { getNodeTheme, getNodeSummary } from '@/modules/workflow/nodes/nodeRegistry'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { MODELS, TEXT_MODELS, getAspectRatios } from '@/types/adapter'
import { UiImagePreview } from '@/components/ui'
import { useImagePreview } from '@/composables/useImagePreview'

const props = defineProps<NodeProps<WorkflowCanvasNodeData>>()
const store = useWorkflowStore()
const workflowNode = computed(() => props.data.workflowNode)
const DEFAULT_WIDTH = 260
const MIN_WIDTH = 220
const MIN_HEIGHT = 80

const dataTypeLabel: Record<string, string> = { Text: '文字', Image: '图片', Any: '任意' }
const { visible: previewVisible, url: previewUrl, open: openPreview } = useImagePreview()

// 图片输入节点：直接在节点上传
const fileInputRef = ref<HTMLInputElement | null>(null)
function triggerUpload() {
  fileInputRef.value?.click()
}
async function onNodeImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const url = await readFileAsDataUrl(file)
  const image = { id: crypto.randomUUID(), fileName: file.name, localPath: url, previewUrl: url }
  store.updateNodeConfig(workflowNode.value.id, { images: [image] })
  input.value = ''
}
function removeNodeImage(imageId: string) {
  const currentImages = Array.isArray(workflowNode.value.config.images) ? workflowNode.value.config.images : []
  store.updateNodeConfig(workflowNode.value.id, { images: currentImages.filter((img: any) => img.id !== imageId) })
}
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') resolve(reader.result); else reject(new Error('读取失败')) }
    reader.onerror = () => reject(new Error('读取失败'))
    reader.readAsDataURL(file)
  })
}

const theme = computed(() => getNodeTheme(workflowNode.value.type))
const nodeIcon = computed(() => {
  const icons = Icons as Record<string, Component>
  return icons[theme.value.icon] ?? icons.Setting
})

const statusIcon = computed(() => {
  const map: Record<string, Component> = { running: Icons.Loading, success: Icons.CircleCheck, failed: Icons.CircleClose, dirty: Icons.Refresh, paused: Icons.VideoPause }
  return map[workflowNode.value.status]
})

const configSummary = computed(() => getNodeSummary(workflowNode.value.type, workflowNode.value.config))

// Inline config
function updateConfig(patch: Record<string, unknown>) {
  store.updateNodeConfig(workflowNode.value.id, patch)
}
const modelOptions = MODELS.map((m) => ({ value: m.id, label: m.name }))
const textModelOptions = TEXT_MODELS.map((m) => ({ value: m.id, label: m.name }))
const currentModel = computed(() => MODELS.find((m) => m.id === workflowNode.value.config.modelName))
const aspectRatios = computed(() => {
  const model = currentModel.value
  if (!model) return ['1:1']
  return getAspectRatios(model, String(workflowNode.value.config.outputSize || '2K'))
})
const resolutions = computed(() => currentModel.value?.resolutions ?? ['2K'])

// 输入值
const inputValues = computed(() => {
  const inputs = resolveNodeInputs(store.workflow, workflowNode.value.id)
  return Object.entries(inputs).map(([portId, input]) => {
    const port = workflowNode.value.inputs.find((p) => p.id === portId)
    let preview = ''
    if (input.result.dataType === 'Text' && typeof input.result.value === 'string') {
      preview = input.result.value.slice(0, 50) + (input.result.value.length > 50 ? '...' : '')
    } else if (input.result.dataType === 'Image') {
      preview = '图片'
    }
    return { portId, portName: port?.name ?? portId, preview, hasValue: true }
  })
})

// 输出值
const outputValues = computed(() => {
  const result = workflowNode.value.result
  if (!result) return []
  if (result.dataType === 'Text' && typeof result.value === 'string') {
    return [{ preview: result.value.slice(0, 50) + (result.value.length > 50 ? '...' : '') }]
  }
  if (result.dataType === 'Image') {
    return [{ preview: '图片已生成' }]
  }
  return []
})

// 图片预览
const previewImages = computed<LocalImageAsset[]>(() => {
  const node = workflowNode.value
  if (node.type === 'image-input') {
    const images = node.config.images
    return Array.isArray(images) ? images.filter(isLocalImageAsset) : []
  }
  if (node.result && isImageNodeResultValue(node.result.value)) return node.result.value.imageList
  return []
})

function isLocalImageAsset(v: unknown): v is LocalImageAsset {
  if (!v || typeof v !== 'object') return false
  const a = v as Record<string, unknown>
  return typeof a.id === 'string' && typeof a.fileName === 'string' && typeof a.localPath === 'string' && typeof a.previewUrl === 'string'
}
function isImageNodeResultValue(v: unknown): v is ImageNodeResultValue {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return Array.isArray(r.imageList) && r.imageList.every(isLocalImageAsset)
}

// Resize
const isResizing = ref(false)
const dragWidth = ref(0)
const dragHeight = ref(0)
const resizeState = ref<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null)
const nodeStyle = computed(() => {
  const s: Record<string, string> = {}
  if (isResizing.value) { s.width = `${dragWidth.value}px`; s.height = `${dragHeight.value}px` }
  else { s.width = `${workflowNode.value.width || DEFAULT_WIDTH}px`; const h = workflowNode.value.height; if (h) s.height = `${h}px` }
  return s
})
function onResizeStart(e: MouseEvent) {
  const el = (e.currentTarget as HTMLElement).closest('.workflow-node') as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  resizeState.value = { startX: e.clientX, startY: e.clientY, startWidth: rect.width, startHeight: rect.height }
  dragWidth.value = rect.width; dragHeight.value = rect.height; isResizing.value = true
  document.addEventListener('mousemove', onResizeMove); document.addEventListener('mouseup', onResizeEnd); e.preventDefault()
}
function onResizeMove(e: MouseEvent) {
  const s = resizeState.value; if (!s) return
  dragWidth.value = Math.max(MIN_WIDTH, s.startWidth + e.clientX - s.startX)
  dragHeight.value = Math.max(MIN_HEIGHT, s.startHeight + e.clientY - s.startY)
}
function onResizeEnd() {
  const s = resizeState.value; if (!s) return
  document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('mouseup', onResizeEnd)
  const dy = Math.abs(dragHeight.value - s.startHeight)
  store.resizeNode(props.id, dragWidth.value, dy >= 3 ? dragHeight.value : undefined)
  isResizing.value = false; resizeState.value = null
}
onUnmounted(() => {
  if (resizeState.value) {
    document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('mouseup', onResizeEnd)
    isResizing.value = false; resizeState.value = null
  }
})
</script>

<template>
  <div
    class="workflow-node"
    :style="nodeStyle"
    :class="[`is-${workflowNode.status}`, { 'is-selected': selected, 'is-disabled': workflowNode.disabled }]"
  >
    <!-- 1. 节点名 -->
    <div class="workflow-node__header" :style="{ background: theme.color + '0D' }">
      <div class="workflow-node__icon" :style="{ background: theme.color + '20', color: theme.color }">
        <el-icon :size="14"><component :is="nodeIcon" /></el-icon>
      </div>
      <span class="workflow-node__title">{{ workflowNode.title }}</span>
      <el-icon v-if="statusIcon" class="workflow-node__status-icon" :class="`status-${workflowNode.status}`"><component :is="statusIcon" /></el-icon>
    </div>

    <!-- 2. 端口（左右两侧） -->
    <div class="workflow-node__ports-row">
      <div v-if="workflowNode.inputs.length" class="workflow-node__ports">
        <div v-for="port in workflowNode.inputs" :key="port.id" class="workflow-node__port">
          <Handle type="target" :id="port.id" :position="Position.Left" :class="['workflow-node__handle', `handle--${port.dataType.toLowerCase()}`]" />
          <span class="workflow-node__port-tag" :class="`tag--${port.dataType.toLowerCase()}`">{{ dataTypeLabel[port.dataType] || port.dataType }}</span>
        </div>
      </div>
      <div class="workflow-node__ports-spacer" />
      <div v-if="workflowNode.outputs.length" class="workflow-node__ports workflow-node__ports--right">
        <div v-for="port in workflowNode.outputs" :key="port.id" class="workflow-node__port workflow-node__port--right">
          <span class="workflow-node__port-tag" :class="`tag--${port.dataType.toLowerCase()}`">{{ dataTypeLabel[port.dataType] || port.dataType }}</span>
          <Handle type="source" :id="port.id" :position="Position.Right" :class="['workflow-node__handle', `handle--${port.dataType.toLowerCase()}`]" />
        </div>
      </div>
    </div>

    <!-- 3. 配置（可编辑） -->
    <div class="workflow-node__section" @click.stop @mousedown.stop>
      <span class="workflow-node__section-label">配置</span>

      <!-- image-input -->
      <template v-if="workflowNode.type === 'image-input'">
        <input ref="fileInputRef" type="file" accept="image/*" style="display:none" @change="onNodeImageUpload" @click.stop />
        <div class="workflow-node__upload-row">
          <el-button size="small" type="primary" plain @click.stop="triggerUpload">上传图片</el-button>
          <span class="workflow-node__section-value">{{ configSummary }}</span>
        </div>
        <div v-if="Array.isArray(workflowNode.config.images) && workflowNode.config.images.length" class="workflow-node__inline-images">
          <div v-for="img in workflowNode.config.images" :key="img.id" class="workflow-node__inline-img" @click.stop>
            <img :src="img.previewUrl" @click.stop="openPreview(img.previewUrl)" />
            <span class="workflow-node__inline-img-del" @click.stop="removeNodeImage(img.id)">×</span>
          </div>
        </div>
      </template>

      <!-- text-input -->
      <template v-else-if="workflowNode.type === 'text-input'">
        <el-input :model-value="workflowNode.config.text" type="textarea" :rows="2" size="small" placeholder="输入文本..." @update:model-value="updateConfig({ text: $event })" />
      </template>

      <!-- text-ai -->
      <template v-else-if="workflowNode.type === 'text-ai'">
        <el-select :model-value="workflowNode.config.modelName" size="small" placeholder="选择模型" style="width:100%" @update:model-value="updateConfig({ modelName: $event })">
          <el-option v-for="m in textModelOptions" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <el-input :model-value="workflowNode.config.taskPrompt" type="textarea" :rows="2" size="small" placeholder="任务指令..." @update:model-value="updateConfig({ taskPrompt: $event })" />
      </template>

      <!-- image-ai -->
      <template v-else-if="workflowNode.type === 'image-ai'">
        <el-select :model-value="workflowNode.config.modelName" size="small" style="width:100%" @update:model-value="updateConfig({ modelName: $event })">
          <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <div class="workflow-node__config-row">
          <el-select :model-value="workflowNode.config.aspectRatio" size="small" @update:model-value="updateConfig({ aspectRatio: $event })">
            <el-option v-for="r in aspectRatios" :key="r" :label="r" :value="r" />
          </el-select>
          <el-select :model-value="workflowNode.config.outputSize" size="small" @update:model-value="updateConfig({ outputSize: $event })">
            <el-option v-for="r in resolutions" :key="r" :label="r" :value="r" />
          </el-select>
        </div>
      </template>

      <!-- prompt-splitter -->
      <template v-else-if="workflowNode.type === 'prompt-splitter'">
        <el-input :model-value="workflowNode.config.delimiter" size="small" placeholder="分隔符" @update:model-value="updateConfig({ delimiter: $event })" />
      </template>

      <!-- 其他节点：只读摘要 -->
      <template v-else>
        <span class="workflow-node__section-value">{{ configSummary }}</span>
      </template>
    </div>

    <!-- 4. 输入值 -->
    <div v-if="inputValues.length" class="workflow-node__section">
      <span class="workflow-node__section-label">输入</span>
      <div v-for="inp in inputValues" :key="inp.portId" class="workflow-node__section-row">
        <span class="workflow-node__section-key">{{ inp.portName }}</span>
        <span class="workflow-node__section-value">{{ inp.preview || '已连接' }}</span>
      </div>
    </div>

    <!-- 5. 输出值 -->
    <div v-if="outputValues.length" class="workflow-node__section">
      <span class="workflow-node__section-label">输出</span>
      <span v-for="(out, i) in outputValues" :key="i" class="workflow-node__section-value">{{ out.preview }}</span>
    </div>

    <!-- 图片预览 -->
    <div v-if="previewImages.length" class="workflow-node__images" :style="{ gridTemplateColumns: previewImages.length === 1 ? '1fr' : 'repeat(2, 1fr)' }">
      <img v-for="img in previewImages" :key="img.id" :src="img.previewUrl" :alt="img.fileName" class="workflow-node__thumb" @click.stop="openPreview(img.previewUrl)" />
    </div>

    <!-- 图片弹窗预览 -->
    <UiImagePreview v-model="previewVisible" :url="previewUrl" />

    <!-- 缩放手柄 -->
    <div v-if="selected" class="workflow-node__resize" @mousedown.stop="onResizeStart">
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 10L10 10L10 0" fill="none" stroke="var(--el-text-color-placeholder)" stroke-width="1.5" /><path d="M2 10L10 10L10 2" fill="none" stroke="var(--el-text-color-placeholder)" stroke-width="1.5" /></svg>
    </div>
  </div>
</template>

<style scoped>
.workflow-node {
  min-width: 220px;
  min-height: 80px;
  background: var(--el-bg-color);
  border: 1.5px solid var(--el-border-color);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  color: var(--el-text-color-primary);
  overflow: visible;
  position: relative;
  transition: box-shadow 0.2s, border-color 0.2s;
  font-size: 12px;
}
.workflow-node.is-selected { border-color: var(--el-color-primary); box-shadow: 0 0 0 2px rgba(64,158,255,0.15); }
.workflow-node.is-disabled, .workflow-node.is-affected { opacity: 0.5; }
.workflow-node.is-running { border-color: var(--el-color-primary); animation: node-pulse 1.2s ease-in-out infinite; }
.workflow-node.is-dirty, .workflow-node.is-paused { border-color: var(--el-color-warning); }
.workflow-node.is-failed { border-color: var(--el-color-danger); }
.workflow-node.is-success { border-color: var(--el-color-success); }
@keyframes node-pulse { 0%,100% { box-shadow: 0 2px 8px rgba(0,0,0,0.06); } 50% { box-shadow: 0 0 12px rgba(64,158,255,0.3); } }

/* 1. 节点名 */
.workflow-node__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 6px;
  border-radius: 10px 10px 0 0;
}
.workflow-node__icon {
  width: 24px; height: 24px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.workflow-node__title { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workflow-node__status-icon { flex-shrink: 0; font-size: 14px; }
.workflow-node__status-icon.status-running { color: var(--el-color-primary); animation: spin 1s linear infinite; }
.workflow-node__status-icon.status-success { color: var(--el-color-success); }
.workflow-node__status-icon.status-failed { color: var(--el-color-danger); }
.workflow-node__status-icon.status-dirty, .workflow-node__status-icon.status-paused { color: var(--el-color-warning); }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* 2. 端口行 */
.workflow-node__ports-row {
  display: flex;
  align-items: stretch;
  padding: 2px 0;
  min-height: 24px;
}
.workflow-node__ports { display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 6px; flex-shrink: 0; }
.workflow-node__ports--right { align-items: flex-end; }
.workflow-node__ports-spacer { flex: 1; }
.workflow-node__port { position: relative; display: flex; align-items: center; gap: 4px; min-height: 16px; }
.workflow-node__port--right { flex-direction: row-reverse; }
.workflow-node__port-tag { font-size: 9px; padding: 0 4px; border-radius: 2px; font-weight: 600; line-height: 13px; white-space: nowrap; }
.tag--text { background: #ecf5ff; color: #409eff; }
.tag--image { background: #f0f9eb; color: #67c23a; }
.tag--any { background: #f4f4f5; color: #909399; }
.workflow-node__handle { width: 8px; height: 8px; border: 2px solid var(--el-bg-color); cursor: crosshair; z-index: 5; }
.handle--text { background: #409eff; }
.handle--image { background: #67c23a; }
.handle--any { background: #909399; }

/* 3-5. 配置/输入/输出 */
.workflow-node__section {
  padding: 3px 10px;
  border-top: 1px solid var(--el-border-color-extra-light);
}
.workflow-node__section-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--el-text-color-placeholder);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-right: 4px;
}
.workflow-node__section-value {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.workflow-node__section-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
}
.workflow-node__section-key {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.workflow-node__config-row {
  display: flex;
  gap: 4px;
}

.workflow-node__upload-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.workflow-node__inline-images {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.workflow-node__inline-img {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
}

.workflow-node__inline-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.workflow-node__inline-img-del {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.workflow-node__inline-img:hover .workflow-node__inline-img-del {
  opacity: 1;
}

.workflow-node__section :deep(.el-input__wrapper),
.workflow-node__section :deep(.el-textarea__inner) {
  box-shadow: none !important;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 11px;
  padding: 4px 6px;
}

.workflow-node__section :deep(.el-select) {
  width: 100%;
}

.workflow-node__section :deep(.el-select .el-input__wrapper) {
  box-shadow: none !important;
  background: var(--el-fill-color-lighter);
}

/* 图片 */
.workflow-node__images { display: grid; gap: 3px; padding: 4px 10px 6px; }
.workflow-node__thumb { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; border: 1px solid var(--el-border-color-lighter); }

/* 缩放 */
.workflow-node__resize { position: absolute; right: 1px; bottom: 1px; width: 14px; height: 14px; cursor: nwse-resize; display: flex; align-items: flex-end; justify-content: flex-end; z-index: 10; }
</style>
