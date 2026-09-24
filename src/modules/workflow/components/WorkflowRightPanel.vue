<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Crop,
  Eye,
  FileText,
  FolderPlus,
  Image,
  ListChecks,
  MessageCircle,
  Monitor,
  MousePointer2,
  Notebook,
  Pencil,
  Play,
  Scissors,
  Settings,
  TriangleAlert,
  Unplug,
  WandSparkles,
} from '@lucide/vue'
import type { Component } from 'vue'
import { Alert, AlertTitle } from '@/components/design-system/primitives/alert'
import { Button } from '@/components/design-system/primitives/button'
import { Input } from '@/components/design-system/primitives/input'
import { Label } from '@/components/design-system/primitives/label'
import { Switch } from '@/components/design-system/primitives/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/design-system/primitives/tabs'
import { Textarea } from '@/components/design-system/primitives/textarea'
import { useWorkflowStore } from '@/modules/workflow/stores/workflowStore'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { getNodeTheme } from '@/modules/workflow/nodes/nodeRegistry'
import { getConfigPanel } from '@/modules/workflow/nodes/registry'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import type { ImageNodeResultValue, LocalImageAsset } from '@/modules/workflow/types/workflow'
import { toBJMinute } from '@/utils/datetime'

const dataTypeLabel: Record<string, string> = { Text: '文字', Image: '图片', Any: '任意' }

const workflowStore = useWorkflowStore()
const { success: showSuccess } = useUiFeedback()
const selectedNode = computed(() => workflowStore.selectedNode)
const activeTab = ref('config')
const collapsed = ref(true)

const theme = computed(() => selectedNode.value ? getNodeTheme(selectedNode.value.type) : { icon: 'Setting', color: 'var(--muted-foreground)' })
/** 节点主题图标：注册表存的是 EP 图标名，这里映射到 Lucide 等价图标 */
const nodeIcons: Record<string, Component> = {
  Picture: Image,
  View: Eye,
  Crop,
  FolderAdd: FolderPlus,
  Notebook,
  Monitor,
  ChatDotRound: MessageCircle,
  Finished: ListChecks,
  MagicStick: WandSparkles,
  EditPen: Pencil,
  Scissor: Scissors,
  Setting: Settings,
}
const nodeIcon = computed(() => nodeIcons[theme.value.icon] ?? Settings)

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

const configPanel = computed(() => selectedNode.value ? getConfigPanel(selectedNode.value.type) : undefined)
function handleConfigUpdate(patch: Record<string, unknown>) {
  if (!selectedNode.value) return
  workflowStore.updateNodeConfig(selectedNode.value.id, patch)
}

const inputSummary = computed(() => selectedNode.value?.inputs ?? [])
const outputSummary = computed(() => selectedNode.value?.outputs ?? [])
const resolvedInputs = computed(() => {
  if (!selectedNode.value) return []
  const inputs = resolveNodeInputs(workflowStore.workflow, selectedNode.value.id)
  return Object.values(inputs).map((input) => ({
    ...input,
    sourceTitle: workflowStore.workflow.nodes.find((n) => n.id === input.sourceNodeId)?.title ?? input.sourceNodeId,
  }))
})

const selectedResult = computed(() => selectedNode.value?.result)
const resultText = computed(() => {
  if (!selectedResult.value) return ''
  if (typeof selectedResult.value.value === 'string') return selectedResult.value.value
  return JSON.stringify(selectedResult.value.value, null, 2)
})
const resultImages = computed(() => {
  const v = selectedResult.value?.value
  return isImageNodeResultValue(v) ? v.imageList : []
})

const isOutputEditable = computed(() => selectedNode.value && ['text-ai', 'text-input', 'prompt-splitter'].includes(selectedNode.value.type))
const editingOutputText = ref('')
const editingPromptSplitterOutputs = ref<Record<string, string>>({})

function beginEditOutput() {
  if (!selectedNode.value?.result) return
  editingPromptSplitterOutputs.value = {}
  if (selectedNode.value.type === 'text-ai' || selectedNode.value.type === 'text-input') {
    editingOutputText.value = typeof selectedNode.value.result.value === 'string' ? selectedNode.value.result.value : ''
  } else if (selectedNode.value.type === 'prompt-splitter') {
    const v = selectedNode.value.result.value
    if (v && typeof v === 'object' && !Array.isArray(v)) editingPromptSplitterOutputs.value = { ...(v as Record<string, string>) }
  }
}
function saveOutputEdit() {
  if (!selectedNode.value?.result) return
  if (selectedNode.value.type === 'prompt-splitter') {
    for (const [key, val] of Object.entries(editingPromptSplitterOutputs.value)) {
      if ((selectedNode.value.result.value as Record<string, unknown>)?.[key] !== val) workflowStore.editNodeOutput(selectedNode.value.id, key, val)
    }
  } else {
    if (selectedNode.value.result.value !== editingOutputText.value) workflowStore.editNodeOutput(selectedNode.value.id, undefined, editingOutputText.value)
  }
  showSuccess('输出已更新')
}

function runSelectedNode() {
  if (!selectedNode.value) return
  workflowStore.clearNodeLogs(selectedNode.value.id)
  activeTab.value = 'logs'
  workflowStore.runNode(selectedNode.value.id)
}

const imageAiTaskId = computed(() => {
  if (selectedNode.value?.type !== 'image-ai') return null
  const v = selectedNode.value?.result?.value
  if (v && typeof v === 'object' && 'taskId' in v) { const t = (v as Record<string, unknown>).taskId; return typeof t === 'string' ? t : null }
  return null
})

function copyLogs() {
  if (!selectedNode.value) return
  const lines = selectedNode.value.logs.map((l) => {
    const t = l.startedAt ? toBJMinute(l.startedAt) : ''
    let line = `[${t}] [${l.level.toUpperCase()}] ${l.message}`
    if (l.request) line += `\n  req: ${JSON.stringify(l.request)}`
    if (l.response) line += `\n  res: ${JSON.stringify(l.response)}`
    return line
  })
  navigator.clipboard.writeText(lines.join('\n')).then(() => showSuccess('日志已复制'))
}

// 外部（如节点右键菜单「打开控制台」）请求打开控制台：展开面板并切到「日志」tab
function openConsole() {
  collapsed.value = false
  activeTab.value = 'logs'
}
onMounted(() => window.addEventListener('canvas:open-console', openConsole))
onUnmounted(() => window.removeEventListener('canvas:open-console', openConsole))

const statusLabels: Record<string, string> = { idle: '未运行', running: '运行中', success: '成功', failed: '失败', dirty: '需重跑', paused: '暂停', disabled: '已禁用', waiting: '等待', affected: '受影响' }
</script>

<template>
  <aside class="panel" :class="{ 'panel--collapsed': collapsed }">
    <!-- 折叠时的展开按钮 -->
    <div v-if="collapsed" class="panel__toggle" @click="collapsed = false" title="展开属性面板">
      <ArrowLeft class="size-3.5" />
    </div>

    <!-- 展开状态 -->
    <template v-if="!collapsed">
      <!-- 收起按钮 -->
      <div class="panel__collapse-btn" @click="collapsed = true" title="收起属性面板">
        <ArrowRight class="size-3.5" />
      </div>

      <template v-if="selectedNode">
        <!-- 节点头部 -->
        <div class="panel__head">
          <div class="panel__node-badge" :style="{ background: `color-mix(in srgb, ${theme.color} 8%, transparent)`, color: theme.color }">
            <component :is="nodeIcon" class="size-4.5" />
          </div>
          <div class="panel__node-info">
            <Input :model-value="selectedNode.title" class="panel__title-input" @update:model-value="workflowStore.updateNodeTitle(selectedNode.id, String($event))" />
            <span class="panel__node-type" :style="{ color: theme.color }">{{ statusLabels[selectedNode.status] || selectedNode.status }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="panel__actions">
          <Button size="sm" @click="runSelectedNode"><Play />运行</Button>
          <Button v-if="selectedNode.status === 'paused'" size="sm"  @click="workflowStore.confirmPausedNode"><Play />继续</Button>
          <div class="panel__actions-spacer" />
          <div class="flex items-center gap-1.5">
            <Switch :model-value="selectedNode.disabled" @update:model-value="workflowStore.setNodeDisabled(selectedNode.id, Boolean($event))" />
            <Label class="text-muted-foreground text-xs">禁用</Label>
          </div>
        </div>

        <!-- Tabs -->
        <Tabs v-model="activeTab" class="panel__tabs">
          <TabsList class="mx-4">
            <TabsTrigger value="config"><Settings />配置</TabsTrigger>
            <TabsTrigger value="io"><Unplug />端口</TabsTrigger>
            <TabsTrigger value="result"><FileText />结果</TabsTrigger>
            <TabsTrigger value="logs"><TriangleAlert />日志</TabsTrigger>
          </TabsList>

          <TabsContent value="config" class="panel__tab-content">
            <div class="panel__tab-body">
              <component :is="configPanel" v-if="configPanel" :node="selectedNode" @update="handleConfigUpdate" />
            </div>
          </TabsContent>

          <TabsContent value="io" class="panel__tab-content">
            <div class="panel__tab-body">
              <div class="panel__section-title">输入端口</div>
              <div class="panel__port-list">
                <div v-for="port in inputSummary" :key="port.id" class="panel__port-item">
                  <span class="panel__port-tag" :class="`tag--${port.dataType.toLowerCase()}`">{{ dataTypeLabel[port.dataType] || port.dataType }}</span>
                  <span class="panel__port-name">{{ port.name }}</span>
                </div>
                <div v-if="!inputSummary.length" class="panel__empty">无输入端口</div>
              </div>
              <template v-if="resolvedInputs.length">
                <div class="panel__section-title">已接收</div>
                <div class="panel__port-list">
                  <div v-for="input in resolvedInputs" :key="input.targetPortId" class="panel__port-item">
                    <span class="panel__port-from">{{ input.sourceTitle }}</span>
                    <ChevronRight class="size-3 shrink-0" />
                    <span class="panel__port-name">{{ input.targetPortId }}</span>
                  </div>
                </div>
              </template>
              <div class="panel__section-title">输出端口</div>
              <div class="panel__port-list">
                <div v-for="port in outputSummary" :key="port.id" class="panel__port-item">
                  <span class="panel__port-name">{{ port.name }}</span>
                  <span class="panel__port-tag" :class="`tag--${port.dataType.toLowerCase()}`">{{ dataTypeLabel[port.dataType] || port.dataType }}</span>
                </div>
                <div v-if="!outputSummary.length" class="panel__empty">无输出端口</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="result" class="panel__tab-content">
            <div class="panel__tab-body">
              <template v-if="isOutputEditable && selectedResult">
                <div v-if="selectedNode.type === 'prompt-splitter' && selectedResult.dataType === 'Text' && selectedResult.value && typeof selectedResult.value === 'object' && !Array.isArray(selectedResult.value)">
                  <div v-for="(val, key) in selectedResult.value" :key="key" class="panel__split-item">
                    <label>{{ key }}</label>
                    <Textarea :model-value="editingPromptSplitterOutputs[key] ?? (val as string)" :rows="2" @update:model-value="editingPromptSplitterOutputs = { ...editingPromptSplitterOutputs, [key]: String($event) }" />
                  </div>
                </div>
                <Textarea v-else :model-value="editingOutputText || resultText" :rows="6" @focus="beginEditOutput" @update:model-value="editingOutputText = String($event)" />
                <Button size="sm" class="mt-2" @click="saveOutputEdit"><Pencil />保存编辑</Button>
                <Alert variant="warning" class="mt-2">
                  <TriangleAlert />
                  <AlertTitle>编辑后下游节点将标记为需重跑</AlertTitle>
                </Alert>
              </template>
              <Textarea v-else-if="resultText" :model-value="resultText" :rows="6" readonly />
              <div v-if="resultImages.length" class="panel__image-grid">
                <img v-for="img in resultImages" :key="img.id" :src="img.previewUrl" :alt="img.fileName" class="panel__image-thumb" />
              </div>
              <div v-if="!selectedResult && !isOutputEditable" class="panel__empty">暂无运行结果</div>
            </div>
          </TabsContent>

          <TabsContent value="logs" class="panel__tab-content">
            <div class="panel__tab-body">
              <div v-if="imageAiTaskId" class="panel__task-id"><span>Task ID</span><code>{{ imageAiTaskId }}</code></div>
              <div v-if="selectedNode.logs.length" class="panel__log-actions">
                <Button size="sm" variant="ghost" @click="copyLogs">复制</Button>
                <Button size="sm" variant="ghost"  @click="workflowStore.clearNodeLogs(selectedNode.id)">清空</Button>
              </div>
              <div v-if="selectedNode.logs.length" class="panel__log-console">
                <div v-for="log in selectedNode.logs" :key="log.id" class="panel__log-line" :class="`is-${log.level}`">
                  <span class="log-time">{{ log.startedAt ? toBJMinute(log.startedAt) : '' }}</span>
                  <span class="log-level">{{ log.level.toUpperCase() }}</span>
                  <span class="log-msg">{{ log.message }}</span>
                </div>
              </div>
              <div v-else class="panel__empty">暂无日志</div>
            </div>
          </TabsContent>
        </Tabs>
      </template>

      <div v-else class="panel__empty-panel">
        <MousePointer2 class="text-(--muted-foreground) size-12" />
        <span>点击节点查看详情</span>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.panel {
  width: 360px;
  min-width: 360px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border-left: 1px solid var(--border);
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  transition: width 0.25s ease, min-width 0.25s ease;
}

.panel--collapsed {
  width: 36px;
  min-width: 36px;
}

.panel__toggle {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted-foreground);
  transition: color 0.2s, background 0.2s;
}
.panel__toggle:hover {
  color: var(--primary);
  background: var(--muted);
}

.panel__collapse-btn {
  position: absolute;
  top: 8px;
  left: 4px;
  width: 24px;
  height: 24px;
  border-radius: var(--ds-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted-foreground);
  transition: color 0.2s, background 0.2s;
  z-index: 10;
}
.panel__collapse-btn:hover {
  color: var(--primary);
  background: var(--muted);
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.panel__node-badge {
  width: 36px;
  height: 36px;
  border-radius: var(--ds-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.panel__node-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel__title-input {
  height: auto;

  padding: 0;

}

.panel__node-type {
  font-size: var(--ds-font-small);
  font-weight: 500;
}

.panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
}

.panel__actions-spacer { flex: 1; }

.panel__tabs {
  flex: 1;
  min-height: 0;
  gap: 0;
}

.panel__tab-content {
  min-height: 0;
  overflow: auto;
}

.panel__tab-body {
  padding: 12px 16px;
}

.panel__section-title {
  font-size: var(--ds-font-small);
  font-weight: 600;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 0 4px;
}

.panel__section-title:first-child {
  padding-top: 0;
}

.panel__port-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.panel__port-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--ds-radius);
  background: var(--muted);
  font-size: var(--ds-font-small);
}

.panel__port-tag {
  font-size: var(--ds-font-small);
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  line-height: 14px;
  flex-shrink: 0;
}

.tag--text { background: var(--accent); color: var(--primary); }
.tag--image { background: var(--ds-success-surface); color: var(--success); }
.tag--any { background: var(--accent); color: var(--ds-info); }

.panel__port-name { flex: 1; color: var(--muted-foreground); }
.panel__port-from { color: var(--muted-foreground); font-size: var(--ds-font-small); }

.panel__empty {
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
  padding: 8px 0;
}

.panel__split-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  margin-bottom: 6px;
  border: 1px solid var(--border);
  border-radius: var(--ds-radius);
}
.panel__split-item label {
  font-size: var(--ds-font-small);
  font-weight: 600;
  color: var(--muted-foreground);
}

.panel__image-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-top: 8px;
}
.panel__image-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--ds-radius);
  border: 1px solid var(--border);
}

.panel__task-id {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 8px;
  background: var(--accent);
  border-radius: var(--ds-radius);
  font-size: var(--ds-font-small);
}
.panel__task-id span { color: var(--muted-foreground); }
.panel__task-id code { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground); }

.panel__log-actions { display: flex; gap: 4px; margin-bottom: 6px; }
.panel__log-console {
  padding: 8px;
  background: var(--ds-terminal-bg);
  border-radius: var(--ds-radius);
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: var(--ds-font-small);
  line-height: 1.5;
  max-height: 400px;
  overflow: auto;
}
.panel__log-line { display: flex; flex-wrap: wrap; gap: 6px; padding: 1px 0; color: var(--ds-terminal-text); }
.panel__log-line.is-error { color: var(--destructive); }
.panel__log-line.is-warn { color: var(--warning); }
.log-time { color: var(--success); flex-shrink: 0; }
.log-level { font-weight: 600; flex-shrink: 0; min-width: 40px; }
.log-msg { word-break: break-all; white-space: normal; }

.panel__empty-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted-foreground);
  font-size: var(--ds-font-small);
}
</style>
