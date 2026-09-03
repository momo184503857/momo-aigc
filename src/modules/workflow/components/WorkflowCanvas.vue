<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  ArrowDown,
  CircleCheck,
  DArrowRight,
  Delete,
  FolderOpened,
  Plus,
  Pointer,
  Setting,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type {
  Connection,
  Edge,
  EdgeMouseEvent,
  Node,
  NodeDragEvent,
  NodeMouseEvent,
} from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import WorkflowNode from '@/modules/workflow/components/WorkflowNode.vue'
import WorkflowRightPanel from '@/modules/workflow/components/WorkflowRightPanel.vue'
import { getNodeDefinitions, getNodeTheme } from '@/modules/workflow/nodes/nodeRegistry'
import { useWorkflowStore } from '@/modules/workflow/stores/workflowStore'
import { useUiFeedback } from '@/composables/useUiFeedback'
import type {
  ImageNodeResultValue,
  LocalImageAsset,
  NodeType,
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData,
  WorkflowPosition,
} from '@/modules/workflow/types/workflow'

type CanvasNode = Node<WorkflowCanvasNodeData>
type CanvasEdge = Edge<WorkflowCanvasEdgeData>

const workflowStore = useWorkflowStore()
const {
  screenToFlowCoordinate,
  fitView,
  nodes: vfNodes,
  setViewport: vfSetViewport,
  onPaneReady,
  onMoveEnd,
} = useVueFlow('ai-workflow-canvas')
const { warning, info } = useUiFeedback()

const nodeDefinitions = getNodeDefinitions()
const flowWrapperRef = ref<HTMLDivElement | null>(null)

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  position: { x: 0, y: 0 } as WorkflowPosition,
  type: 'pane' as 'pane' | 'node',
  nodeId: '' as string,
})

const canvasNodes = computed(() => workflowStore.canvasNodes)
const canvasEdges = computed(() => workflowStore.canvasEdges)

// ── 视口持久化：项目加载后恢复保存的视口；用户平移/缩放后写回（随图自动保存） ──
let viewportReady = false

onPaneReady(() => {
  const vp = workflowStore.workflow.viewport
  if (vp) {
    vfSetViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
  }
  viewportReady = true
})

onMoveEnd((event) => {
  if (!viewportReady) return
  const t = event.flowTransform
  workflowStore.saveViewport({ x: t.x, y: t.y, zoom: t.zoom })
})

// 项目在画布挂载后才加载完成（keep-alive 切换项目）时，同样恢复视口
watch(
  () => workflowStore.workflow,
  async () => {
    await nextTick()
    if (!viewportReady) return
    const vp = workflowStore.workflow.viewport
    if (vp) {
      vfSetViewport({ x: vp.x, y: vp.y, zoom: vp.zoom })
    }
  }
)

const onNodeDragStop = (event: NodeDragEvent) => {
  // 多选拖动时 event.nodes 含所有被拖动节点；一次历史入栈
  const dragged = Array.isArray(event.nodes) && event.nodes.length ? event.nodes : [event.node]
  workflowStore.updateNodesPositions(
    dragged.map((n) => ({ id: n.id, position: n.position }))
  )
}

const closeContextMenu = () => {
  contextMenu.visible = false
}

const openContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  })

  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.position = position
  contextMenu.type = 'pane'
  contextMenu.nodeId = ''
}

const openNodeContextMenu = (event: NodeMouseEvent) => {
  event.event.preventDefault()
  const me = event.event as MouseEvent
  const position = screenToFlowCoordinate({
    x: me.clientX,
    y: me.clientY,
  })

  contextMenu.visible = true
  contextMenu.x = me.clientX
  contextMenu.y = me.clientY
  contextMenu.position = position
  contextMenu.type = 'node'
  contextMenu.nodeId = event.node.id

  workflowStore.selectNode(event.node.id)
}

const addNode = (type: NodeType) => {
  workflowStore.addNode(type, contextMenu.position)
  closeContextMenu()
}

const handleCopyNode = () => {
  workflowStore.copySelection(getSelectedNodeIds())
  closeContextMenu()
}

const handlePasteNode = () => {
  workflowStore.pasteNode(contextMenu.position)
  closeContextMenu()
}

const openConsole = () => {
  // 展开右侧属性面板并切到「日志」tab（由 WorkflowRightPanel 监听该事件）
  window.dispatchEvent(new CustomEvent('canvas:open-console'))
  closeContextMenu()
}

const getSelectedNodeIds = (): string[] => {
  const ids: string[] = []

  if (contextMenu.nodeId) {
    ids.push(contextMenu.nodeId)
  }

  for (const vn of vfNodes.value) {
    if (vn.selected && vn.id !== contextMenu.nodeId) {
      ids.push(vn.id)
    }
  }

  if (ids.length === 0 && workflowStore.selectedNodeId) {
    ids.push(workflowStore.selectedNodeId)
  }

  return ids
}

/** MiniMap 节点着色：按节点类型主题色 */
const miniMapNodeColor = (node: Node): string => {
  const data = node.data as WorkflowCanvasNodeData | undefined
  return getNodeTheme(data?.workflowNode?.type ?? '').color
}

const handleConnect = (connection: Connection) => {
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle
  ) {
    warning('连接失败：端口不存在。')
    return
  }

  workflowStore.addEdge({
    sourceNodeId: connection.source,
    sourcePortId: connection.sourceHandle,
    targetNodeId: connection.target,
    targetPortId: connection.targetHandle,
  })
}

const isValidConnection = (connection: Connection): boolean => {
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle
  ) {
    return false
  }

  const sourceNode = workflowStore.workflow.nodes.find((node) => node.id === connection.source)
  const targetNode = workflowStore.workflow.nodes.find((node) => node.id === connection.target)
  const sourcePort = sourceNode?.outputs.find((port) => port.id === connection.sourceHandle)
  const targetPort = targetNode?.inputs.find((port) => port.id === connection.targetHandle)

  if (!sourcePort || !targetPort) {
    return false
  }

  return (
    sourcePort.dataType === targetPort.dataType ||
    sourcePort.dataType === 'Any' ||
    targetPort.dataType === 'Any'
  )
}

const handleNodeClick = (event: NodeMouseEvent) => {
  workflowStore.selectNode(event.node.id)
  closeContextMenu()
}

const handleEdgeClick = (event: EdgeMouseEvent) => {
  workflowStore.selectEdge(event.edge.id)
  closeContextMenu()
}

const handlePaneClick = () => {
  workflowStore.clearSelection()
  closeContextMenu()
}

const hasSelectedNode = computed(() => !!workflowStore.selectedNodeId)

const multiSelectTick = ref(0)

const hasMultiSelection = computed(() => {
  void multiSelectTick.value
  const nodes = vfNodes.value
  return Array.isArray(nodes) && nodes.some((n) => n.selected)
})

const hasAnySelection = computed(
  () => hasMultiSelection.value || !!workflowStore.selectedNodeId || !!workflowStore.selectedEdgeId
)

const onSelectionEnd = () => {
  multiSelectTick.value++
  // 选区拖动结束后同步所有选中节点位置（vue-flow 对选区整体拖动不发 node-drag-stop）
  const selected = Array.isArray(vfNodes.value) ? vfNodes.value.filter((n) => n.selected) : []
  if (selected.length > 1) {
    workflowStore.updateNodesPositions(
      selected.map((n) => ({ id: n.id, position: { x: n.position.x, y: n.position.y } }))
    )
  }
}

const handleDeleteSelected = () => {
  const nodes = vfNodes.value
  const selectedIds = Array.isArray(nodes) ? nodes.filter((n) => n.selected).map((n) => n.id) : []
  if (selectedIds.length > 0) {
    workflowStore.deleteSelected(selectedIds)
  } else {
    workflowStore.deleteSelected()
  }
}

const runAll = () => {
  if (workflowStore.workflow.nodes.length === 0) {
    warning('画布中没有节点，请先添加节点。')
    return
  }
  workflowStore.runAllWorkflow()
}

const runToCurrent = () => {
  if (!workflowStore.selectedNodeId) {
    warning('请先选中一个节点。')
    return
  }
  workflowStore.runToCurrent(workflowStore.selectedNodeId)
}

const runFromCurrent = () => {
  if (!workflowStore.selectedNodeId) {
    warning('请先选中一个节点。')
    return
  }
  workflowStore.runFromCurrent(workflowStore.selectedNodeId)
}

const stopExecution = () => {
  workflowStore.cancelExecution()
  info('已停止执行。')
}

const handleFileCommand = (command: string) => {
  switch (command) {
    case 'save':
      workflowStore.saveCurrentProject()
      break
    case 'export':
      workflowStore.exportTemplate()
      break
  }
}

const handleRunCommand = (command: string) => {
  switch (command) {
    case 'all':
      runAll()
      break
    case 'to':
      runToCurrent()
      break
    case 'from':
      runFromCurrent()
      break
  }
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

const handleKeydown = (event: KeyboardEvent) => {
  if (isEditableTarget(event.target)) return

  if ((event.ctrlKey || event.metaKey) && event.key === 'c' && !event.shiftKey) {
    const ids = getSelectedNodeIds()
    if (ids.length > 0) {
      event.preventDefault()
      workflowStore.copySelection(ids)
    }
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'v' && !event.shiftKey) {
    if (workflowStore.copiedNodes.length > 0) {
      event.preventDefault()
      const viewportCenter = screenToFlowCoordinate({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      workflowStore.pasteNode(viewportCenter)
    }
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    workflowStore.undo()
    return
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    (event.key === 'y' || (event.key === 'z' && event.shiftKey))
  ) {
    event.preventDefault()
    workflowStore.redo()
    return
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  if (isEditableTarget(event.target)) return

  const nodes = vfNodes.value
  const selectedNodeIds = Array.isArray(nodes)
    ? nodes.filter((n) => n.selected).map((n) => n.id)
    : []
  if (selectedNodeIds.length > 0) {
    event.preventDefault()
    workflowStore.deleteSelected(selectedNodeIds)
    return
  }

  if (!workflowStore.selectedNodeId && !workflowStore.selectedEdgeId) return

  event.preventDefault()
  workflowStore.deleteSelected()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="workflow-shell">
    <section ref="flowWrapperRef" class="workflow-shell__canvas" @contextmenu.prevent>
      <div class="workflow-shell__toolbar">
        <el-button :icon="Plus" type="primary" plain @click="openContextMenu($event)">
          新增节点
        </el-button>

        <el-button :icon="Pointer" @click="fitView()">适配视图</el-button>

        <el-dropdown trigger="click" @command="handleFileCommand">
          <el-button :icon="FolderOpened">
            文件<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="save">保存</el-dropdown-item>
              <el-dropdown-item command="export" divided>导出模板</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <template v-if="!workflowStore.isRunning">
          <el-dropdown trigger="click" @command="handleRunCommand">
            <el-button :icon="VideoPlay" type="success">
              运行<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="all" :icon="VideoPlay">运行全部</el-dropdown-item>
                <el-dropdown-item command="to" :icon="CircleCheck" :disabled="!hasSelectedNode">
                  运行到当前
                </el-dropdown-item>
                <el-dropdown-item command="from" :icon="DArrowRight" :disabled="!hasSelectedNode">
                  从当前继续
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>

        <el-button
          v-if="workflowStore.isRunning"
          :icon="VideoPause"
          type="danger"
          @click="stopExecution"
        >
          停止
        </el-button>

        <el-button
          :icon="Delete"
          type="danger"
          plain
          :disabled="!hasAnySelection"
          @click="handleDeleteSelected"
        >
          删除选中
        </el-button>
      </div>

      <VueFlow
        id="ai-workflow-canvas"
        :nodes="canvasNodes"
        :edges="canvasEdges"
        class="workflow-flow"
        :is-valid-connection="isValidConnection"
        :delete-key-code="null"
        :fit-view-on-init="true"
        :min-zoom="0.25"
        :max-zoom="1.5"
        :pan-on-drag="true"
        :selection-on-drag="true"
        :multi-selection-key-code="'Shift'"
        :snap-to-grid="true"
        :snap-grid="[16, 16]"
        @selection-drag-stop="onSelectionEnd"
        @connect="handleConnect"
        @node-click="handleNodeClick"
        @node-context-menu="openNodeContextMenu"
        @node-drag-stop="onNodeDragStop"
        @edge-click="handleEdgeClick"
        @pane-click="handlePaneClick"
        @pane-context-menu="openContextMenu"
      >
        <template #node-workflow="nodeProps">
          <WorkflowNode v-bind="nodeProps" />
        </template>
        <Background :variant="BackgroundVariant.Dots" :gap="16" :size="1.2" />
        <Controls position="bottom-left" :show-interactive="false" />
        <MiniMap position="bottom-right" pannable zoomable :node-color="miniMapNodeColor" :node-stroke-color="miniMapNodeColor" mask-color="rgba(125,125,125,0.18)" />
      </VueFlow>

      <!-- Pane context menu -->
      <div
        v-if="contextMenu.visible && contextMenu.type === 'pane'"
        class="workflow-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <button
          class="workflow-context-menu__item"
          type="button"
          :disabled="!workflowStore.copiedNodes.length"
          @click="handlePasteNode"
        >
          <strong>粘贴节点</strong>
          <span>{{
            workflowStore.copiedNodes.length
              ? workflowStore.copiedNodes.map((n) => n.title).join('、')
              : '请先复制节点'
          }}</span>
        </button>

        <div class="workflow-context-menu__section">新增节点</div>
        <button
          v-for="definition in nodeDefinitions"
          :key="definition.type"
          class="workflow-context-menu__item"
          type="button"
          @click="addNode(definition.type)"
        >
          <strong>{{ definition.title }}</strong>
          <span>{{ definition.description }}</span>
        </button>
      </div>

      <!-- Node context menu -->
      <div
        v-if="contextMenu.visible && contextMenu.type === 'node'"
        class="workflow-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <button class="workflow-context-menu__item" type="button" @click="handleCopyNode">
          <strong>复制节点</strong>
          <span>Ctrl+C</span>
        </button>

        <button
          class="workflow-context-menu__item"
          type="button"
          :disabled="!workflowStore.copiedNodes.length"
          @click="handlePasteNode"
        >
          <strong>粘贴节点</strong>
          <span>{{ workflowStore.copiedNodes.length ? 'Ctrl+V' : '请先复制节点' }}</span>
        </button>

        <button
          class="workflow-context-menu__item"
          type="button"
          :disabled="!hasSelectedNode || workflowStore.isRunning"
          @click="runToCurrent(); closeContextMenu()"
        >
          <strong>运行到当前</strong>
          <span>执行此节点及其上游</span>
        </button>

        <button
          class="workflow-context-menu__item"
          type="button"
          :disabled="!hasSelectedNode || workflowStore.isRunning"
          @click="runFromCurrent(); closeContextMenu()"
        >
          <strong>从当前继续</strong>
          <span>执行此节点及其下游</span>
        </button>

        <button class="workflow-context-menu__item" type="button" @click="openConsole">
          <strong>打开控制台</strong>
          <span>查看运行日志</span>
        </button>

        <button
          class="workflow-context-menu__item workflow-context-menu__item--danger"
          type="button"
          @click="workflowStore.deleteSelected(); closeContextMenu()"
        >
          <strong>删除节点</strong>
          <span>Delete</span>
        </button>
      </div>
    </section>

    <WorkflowRightPanel />
  </div>
</template>

<style scoped>
.workflow-shell {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}

.workflow-shell__canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.workflow-shell__toolbar {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  box-shadow: var(--el-box-shadow-light);
}

.workflow-flow {
  width: 100%;
  height: 100%;
}

/* ── MiniMap / Controls / Background 主题化 ── */
.workflow-flow :deep(.vue-flow__minimap) {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  box-shadow: var(--el-box-shadow-light);
}

.workflow-flow :deep(.vue-flow__minimap-mask) {
  fill: var(--el-overlay-color-lighter);
  stroke: var(--el-border-color);
  stroke-width: 2;
}

.workflow-flow :deep(.vue-flow__controls) {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  box-shadow: var(--el-box-shadow-light);
}

.workflow-flow :deep(.vue-flow__controls-button) {
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
  fill: var(--el-text-color-regular);
}

.workflow-flow :deep(.vue-flow__controls-button:hover) {
  background: var(--el-fill-color-light);
}

.workflow-flow :deep(.vue-flow__controls-button svg) {
  fill: currentColor;
}

/* 点阵背景网格：圆点用边框色 */
.workflow-flow :deep(.vue-flow__background circle) {
  fill: var(--el-border-color);
}

/* 连线流动动画：虚线偏移（运行中来源节点） */
.workflow-flow :deep(.vue-flow__edge.animated path) {
  stroke-dasharray: 6 4;
  animation: workflow-edge-dash 0.5s linear infinite;
}

@keyframes workflow-edge-dash {
  to {
    stroke-dashoffset: -10;
  }
}

.workflow-context-menu {
  position: fixed;
  z-index: 1000;
  width: 260px;
  padding: 8px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: var(--momo-radius-md);
  box-shadow: var(--el-box-shadow);
}

.workflow-context-menu__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px;
  color: var(--el-text-color-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--momo-radius-sm);
  cursor: pointer;
}

.workflow-context-menu__item:hover {
  background: var(--el-fill-color-light);
}

.workflow-context-menu__item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.workflow-context-menu__item--danger strong {
  color: var(--el-color-danger);
}

.workflow-context-menu__item strong {
  font-size: var(--el-font-size-base);
  font-weight: 600;
}

.workflow-context-menu__item span {
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
  line-height: 1.5;
}

.workflow-context-menu__section {
  padding: 4px 8px;
  color: var(--el-text-color-placeholder);
  font-size: var(--el-font-size-extra-small);
  font-weight: 600;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 4px;
  padding-top: 8px;
}
</style>
