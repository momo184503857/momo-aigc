<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import {
  EditPen, Back, RefreshLeft, Delete, Crop, Check, Close,
  ArrowDown, Loading, Picture, ZoomIn, ZoomOut, Aim,
} from '@element-plus/icons-vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { isOssImageUrl } from '@/utils/download'
import type { TaskItem } from '@/components/TaskList.vue'

defineOptions({ name: 'ImageEditorDialog' })

const props = defineProps<{
  modelValue: boolean
  imageUrl?: string
  task?: TaskItem | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'done': [result: { dataUrl: string; file: File; sourceUrl?: string }]
}>()

const { success, error, info, warning } = useUiFeedback()

// ─── Editor types ───
type Tool = 'brush' | 'eraser' | 'text' | 'shape' | 'crop'
type ShapeType = 'rect' | 'circle' | 'line' | 'arrow'

interface Point { x: number; y: number }

type EditorObject =
  | { type: 'brush'; points: Point[]; color: string; size: number }
  | { type: 'eraser'; points: Point[]; size: number }
  | { type: 'text'; x: number; y: number; text: string; color: string; fontSize: number }
  | { type: 'shape'; shape: ShapeType; x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number }

// ─── Canvas refs ───
const baseCanvas = ref<HTMLCanvasElement | null>(null)
const drawCanvas = ref<HTMLCanvasElement | null>(null)
const canvasWrap = ref<HTMLDivElement | null>(null)
const canvasArea = ref<HTMLDivElement | null>(null)

// ─── Editor state ───
const currentTool = ref<Tool>('brush')
const currentShape = ref<ShapeType>('rect')
const brushColor = ref('#ff4d4f')
const brushSize = ref(6)
const fontSize = ref(24)
const textColor = ref('#ff4d4f')
const strokeWidth = ref(4)

const objects = ref<EditorObject[]>([])
const redoStack = ref<EditorObject[]>([])

const imageLoading = ref(false)
const imageError = ref('')
const imageWidth = ref(0)
const imageHeight = ref(0)

// Display scale: canvas intrinsic px -> displayed px (base fit)
const baseScale = ref(1)
// User zoom multiplier on top of baseScale
const zoom = ref(1)
// Pan offset in display px
const pan = ref({ x: 0, y: 0 })
// Computed display scale = baseScale * zoom
const displayScale = computed(() => baseScale.value * zoom.value)

// ─── Drawing interaction state ───
let isDrawing = false
let currentObj: EditorObject | null = null
let dragStart: Point | null = null

// ─── Text input state ───
const textInputVisible = ref(false)
const textInputValue = ref('')
const textInputPos = ref({ x: 0, y: 0 })

// ─── Crop state ───
const cropMode = ref(false)
const cropRect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
let cropStart: Point | null = null

// ─── Image loading ───
async function loadImage(url: string) {
  imageLoading.value = true
  imageError.value = ''
  objects.value = []
  redoStack.value = []

  try {
    let blob: Blob
    if (isOssImageUrl(url)) {
      // OSS images are cross-origin; fetch via server proxy to avoid canvas tainting
      const token = localStorage.getItem('auth_token')
      const resp = await fetch('/api/proxy/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url }),
      })
      if (!resp.ok) throw new Error(`代理请求失败 (${resp.status})`)
      blob = await resp.blob()
    } else {
      const resp = await fetch(url, { cache: 'force-cache' })
      if (!resp.ok) throw new Error(`图片加载失败 (${resp.status})`)
      blob = await resp.blob()
    }

    const blobUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      imageWidth.value = img.naturalWidth
      imageHeight.value = img.naturalHeight
      nextTick(() => {
        setupCanvases(img)
        URL.revokeObjectURL(blobUrl)
        imageLoading.value = false
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      imageError.value = '图片解码失败'
      imageLoading.value = false
    }
    img.src = blobUrl
  } catch (e) {
    imageError.value = e instanceof Error ? e.message : '图片加载失败'
    imageLoading.value = false
  }
}

function setupCanvases(img: HTMLImageElement) {
  const base = baseCanvas.value
  const draw = drawCanvas.value
  const wrap = canvasWrap.value
  const area = canvasArea.value
  if (!base || !draw || !wrap || !area) return

  // Set intrinsic size to image's natural size (cap very large images for perf)
  const MAX_DIM = 2400
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (w > MAX_DIM || h > MAX_DIM) {
    const r = Math.min(MAX_DIM / w, MAX_DIM / h)
    w = Math.round(w * r)
    h = Math.round(h * r)
  }

  base.width = w
  base.height = h
  draw.width = w
  draw.height = h

  // Fit image to the canvas area (consider BOTH width and height)
  const areaW = area.clientWidth
  const areaH = area.clientHeight
  const scaleX = areaW > 0 ? areaW / w : 1
  const scaleY = areaH > 0 ? areaH / h : 1
  baseScale.value = Math.min(scaleX, scaleY, 1) // never upscale beyond 1x
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  updateCanvasStyle()

  // Draw base image
  const bctx = base.getContext('2d')
  if (bctx) {
    bctx.clearRect(0, 0, w, h)
    bctx.drawImage(img, 0, 0, w, h)
  }
  // Clear draw layer
  const dctx = draw.getContext('2d')
  if (dctx) dctx.clearRect(0, 0, w, h)
}

// Apply display size + transform to both canvases
function updateCanvasStyle() {
  const base = baseCanvas.value
  const draw = drawCanvas.value
  if (!base || !draw) return
  const ds = displayScale.value
  // CSS size = intrinsic size * baseScale (the "fit" size)
  const cssW = base.width * baseScale.value
  const cssH = base.height * baseScale.value
  base.style.width = cssW + 'px'
  base.style.height = cssH + 'px'
  draw.style.width = cssW + 'px'
  draw.style.height = cssH + 'px'
  // Apply user zoom + pan via transform (on the wrapper, so both canvases move together)
  const wrap = canvasWrap.value
  if (wrap) {
    wrap.style.transform = `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`
    wrap.style.transformOrigin = 'center center'
  }
}

// ─── Zoom & Pan ───
const isPanning = ref(false)
let panStart = { x: 0, y: 0, px: 0, py: 0 }

function onWheel(e: WheelEvent) {
  if (imageLoading.value || imageError.value) return
  // Ctrl+wheel or plain wheel both zoom; keep it simple
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newZoom = Math.max(0.2, Math.min(8, zoom.value + delta))
  if (newZoom === zoom.value) return

  // Zoom toward mouse position (keep the point under cursor stable)
  const area = canvasArea.value
  const wrap = canvasWrap.value
  if (!area || !wrap) { zoom.value = newZoom; updateCanvasStyle(); return }

  const areaRect = area.getBoundingClientRect()
  // Mouse position relative to area center (transform-origin is center)
  const mx = e.clientX - (areaRect.left + areaRect.width / 2)
  const my = e.clientY - (areaRect.top + areaRect.height / 2)
  // Point under cursor in pre-zoom canvas display coords (before transform):
  //   displayPoint = (mouse - pan) / oldZoom
  // After zoom, we want: mouse = displayPoint * newZoom + pan'
  //   pan' = mouse - displayPoint * newZoom
  const dispX = (mx - pan.value.x) / zoom.value
  const dispY = (my - pan.value.y) / zoom.value
  pan.value.x = mx - dispX * newZoom
  pan.value.y = my - dispY * newZoom
  zoom.value = newZoom
  updateCanvasStyle()
}

function startPan(e: MouseEvent) {
  isPanning.value = true
  panStart = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
}

function onMouseMovePan(e: MouseEvent) {
  if (!isPanning.value) return
  pan.value.x = panStart.px + (e.clientX - panStart.x)
  pan.value.y = panStart.py + (e.clientY - panStart.y)
  updateCanvasStyle()
}

function endPan() {
  isPanning.value = false
}

function zoomIn() {
  zoom.value = Math.min(8, zoom.value + 0.2)
  updateCanvasStyle()
}
function zoomOut() {
  zoom.value = Math.max(0.2, zoom.value - 0.2)
  updateCanvasStyle()
}
function resetZoom() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  updateCanvasStyle()
}

// ─── Coordinate helper: screen -> canvas intrinsic ───
function getCanvasPoint(e: MouseEvent): Point {
  const draw = drawCanvas.value
  if (!draw) return { x: 0, y: 0 }
  const rect = draw.getBoundingClientRect()
  // rect already reflects the transformed (scaled/panned) on-screen size,
  // so mapping back to intrinsic coords is the same ratio.
  const x = ((e.clientX - rect.left) / rect.width) * draw.width
  const y = ((e.clientY - rect.top) / rect.height) * draw.height
  return { x, y }
}

// ─── Redraw all objects on draw canvas ───
function redraw() {
  const draw = drawCanvas.value
  if (!draw) return
  const ctx = draw.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, draw.width, draw.height)
  for (const obj of objects.value) {
    drawObject(ctx, obj)
  }
  // Draw preview for current in-progress shape
  if (currentObj && (currentObj.type === 'shape')) {
    drawObject(ctx, currentObj)
  }
}

function drawObject(ctx: CanvasRenderingContext2D, obj: EditorObject) {
  ctx.save()
  if (obj.type === 'brush') {
    ctx.strokeStyle = obj.color
    ctx.lineWidth = obj.size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pts = obj.points
    if (pts.length === 1) {
      // Single dot
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, obj.size / 2, 0, Math.PI * 2)
      ctx.fillStyle = obj.color
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.stroke()
    }
  } else if (obj.type === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.lineWidth = obj.size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pts = obj.points
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, obj.size / 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,1)'
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      ctx.stroke()
    }
  } else if (obj.type === 'text') {
    ctx.fillStyle = obj.color
    ctx.font = `${obj.fontSize}px sans-serif`
    ctx.textBaseline = 'top'
    const lines = obj.text.split('\n')
    lines.forEach((line, i) => {
      ctx.fillText(line, obj.x, obj.y + i * obj.fontSize * 1.2)
    })
  } else if (obj.type === 'shape') {
    ctx.strokeStyle = obj.color
    ctx.lineWidth = obj.strokeWidth
    ctx.lineCap = 'round'
    const { x1, y1, x2, y2 } = obj
    if (obj.shape === 'rect') {
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
    } else if (obj.shape === 'circle') {
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2
      const rx = Math.abs(x2 - x1) / 2
      const ry = Math.abs(y2 - y1) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (obj.shape === 'line') {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    } else if (obj.shape === 'arrow') {
      drawArrow(ctx, x1, y1, x2, y2, obj.strokeWidth)
    }
  }
  ctx.restore()
}

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) {
  const headLen = Math.max(12, width * 4)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  // Arrowhead
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle as string
  ctx.fill()
}

// ─── Mouse handlers ───
// Space key for pan
const spacePressed = ref(false)

function onMouseDown(e: MouseEvent) {
  if (imageLoading.value || imageError.value) return

  // Middle mouse button OR space+left = pan
  if (e.button === 1 || (e.button === 0 && spacePressed.value)) {
    e.preventDefault()
    startPan(e)
    return
  }
  if (e.button !== 0) return

  const pt = getCanvasPoint(e)

  if (cropMode.value) {
    cropStart = pt
    cropRect.value = { x: pt.x, y: pt.y, w: 0, h: 0 }
    return
  }

  if (currentTool.value === 'text') {
    // Show inline text input at clicked position.
    // Position relative to canvasWrap's internal (pre-transform) coords:
    //   canvasPoint (intrinsic) * baseScale = position within wrap before transform
    textInputPos.value = {
      x: pt.x * baseScale.value,
      y: pt.y * baseScale.value,
    }
    textInputValue.value = ''
    textInputVisible.value = true
    nextTick(() => {
      const input = document.querySelector<HTMLInputElement>('.editor-text-input')
      input?.focus()
    })
    return
  }

  isDrawing = true
  dragStart = pt

  if (currentTool.value === 'brush') {
    currentObj = { type: 'brush', points: [pt], color: brushColor.value, size: brushSize.value }
  } else if (currentTool.value === 'eraser') {
    currentObj = { type: 'eraser', points: [pt], size: brushSize.value * 2 }
  } else if (currentTool.value === 'shape') {
    currentObj = {
      type: 'shape', shape: currentShape.value,
      x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y,
      color: brushColor.value, strokeWidth: strokeWidth.value,
    }
  }
}

function onMouseMove(e: MouseEvent) {
  if (imageLoading.value || imageError.value) return

  // Handle panning
  if (isPanning.value) {
    onMouseMovePan(e)
    return
  }

  const pt = getCanvasPoint(e)

  if (cropMode.value && cropStart) {
    cropRect.value = {
      x: Math.min(cropStart.x, pt.x),
      y: Math.min(cropStart.y, pt.y),
      w: Math.abs(pt.x - cropStart.x),
      h: Math.abs(pt.y - cropStart.y),
    }
    return
  }

  if (!isDrawing || !currentObj) return

  if (currentObj.type === 'brush' || currentObj.type === 'eraser') {
    currentObj.points.push(pt)
    // Incremental draw for performance
    const draw = drawCanvas.value
    if (!draw) return
    const ctx = draw.getContext('2d')
    if (!ctx) return
    ctx.save()
    if (currentObj.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.strokeStyle = currentObj.color
    }
    ctx.lineWidth = currentObj.type === 'eraser' ? currentObj.size : (currentObj as { size: number }).size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pts = currentObj.points
    if (pts.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y)
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
      ctx.stroke()
    }
    ctx.restore()
  } else if (currentObj.type === 'shape') {
    currentObj.x2 = pt.x
    currentObj.y2 = pt.y
    redraw()
  }
}

function onMouseUp() {
  if (isPanning.value) {
    endPan()
    return
  }
  if (cropMode.value) {
    cropStart = null
    return
  }
  if (!isDrawing || !currentObj) return
  isDrawing = false
  // Commit object
  // For shapes, ignore zero-size clicks
  if (currentObj.type === 'shape' && currentObj.x1 === currentObj.x2 && currentObj.y1 === currentObj.y2) {
    currentObj = null
    redraw()
    return
  }
  objects.value.push(currentObj)
  redoStack.value = [] // clear redo on new action
  currentObj = null
  redraw()
}

// ─── Text input handlers ───
function commitText() {
  const text = textInputValue.value.trim()
  textInputVisible.value = false
  if (!text) return

  // textInputPos was stored as canvasPoint * baseScale (wrap-internal coords).
  // Convert back to canvas intrinsic coords by dividing by baseScale.
  const x = textInputPos.value.x / baseScale.value
  const y = textInputPos.value.y / baseScale.value

  // Font size in canvas intrinsic coords: display fontSize / baseScale
  // (zoom doesn't factor in because the wrap transform scales it visually)
  const canvasFontSize = Math.round(fontSize.value / baseScale.value)

  objects.value.push({
    type: 'text',
    x, y,
    text,
    color: textColor.value,
    fontSize: canvasFontSize,
  })
  redoStack.value = []
  textInputValue.value = ''
  redraw()
}

function cancelText() {
  textInputVisible.value = false
  textInputValue.value = ''
}

// ─── Tool actions ───
function undo() {
  if (objects.value.length === 0) return
  const last = objects.value.pop()
  if (last) redoStack.value.push(last)
  redraw()
}

function redo() {
  if (redoStack.value.length === 0) return
  const obj = redoStack.value.pop()
  if (obj) objects.value.push(obj)
  redraw()
}

function clearAll() {
  if (objects.value.length === 0) return
  objects.value = []
  redoStack.value = []
  redraw()
}

// ─── Crop ───
function toggleCrop() {
  cropMode.value = !cropMode.value
  cropRect.value = null
  if (cropMode.value) {
    currentTool.value = 'shape' // placeholder, crop overrides
  }
}

function applyCrop() {
  const rect = cropRect.value
  const base = baseCanvas.value
  if (!rect || !base || rect.w < 5 || rect.h < 5) {
    warning('裁剪区域太小')
    return
  }

  const sx = Math.round(rect.x)
  const sy = Math.round(rect.y)
  const sw = Math.round(rect.w)
  const sh = Math.round(rect.h)

  // Crop base canvas
  const tmpCanvas = document.createElement('canvas')
  tmpCanvas.width = sw
  tmpCanvas.height = sh
  const tmpCtx = tmpCanvas.getContext('2d')
  if (!tmpCtx) return
  tmpCtx.drawImage(base, sx, sy, sw, sh, 0, 0, sw, sh)

  // Replace base canvas content
  const bctx = base.getContext('2d')
  if (!bctx) return
  base.width = sw
  base.height = sh
  bctx.drawImage(tmpCanvas, 0, 0)

  // Crop draw canvas too (preserve annotations within crop region)
  const draw = drawCanvas.value
  if (draw) {
    const dtmp = document.createElement('canvas')
    dtmp.width = sw
    dtmp.height = sh
    const dtmpCtx = dtmp.getContext('2d')
    if (dtmpCtx) {
      dtmpCtx.drawImage(draw, sx, sy, sw, sh, 0, 0, sw, sh)
    }
    draw.width = sw
    draw.height = sh
    const dctx = draw.getContext('2d')
    if (dctx) {
      dctx.clearRect(0, 0, sw, sh)
      dctx.drawImage(dtmp, 0, 0)
    }
  }

  imageWidth.value = sw
  imageHeight.value = sh

  // Recompute fit scale and reset zoom/pan after crop
  const area = canvasArea.value
  if (area) {
    const scaleX = area.clientWidth / sw
    const scaleY = area.clientHeight / sh
    baseScale.value = Math.min(scaleX, scaleY, 1)
  }
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  updateCanvasStyle()

  cropMode.value = false
  cropRect.value = null
  success('已裁剪')
}

function cancelCrop() {
  cropMode.value = false
  cropRect.value = null
}

// ─── Export ───
async function exportImage(): Promise<{ dataUrl: string; file: File; sourceUrl?: string } | null> {
  const base = baseCanvas.value
  const draw = drawCanvas.value
  if (!base) return null

  // Merge base + draw layers
  const merged = document.createElement('canvas')
  merged.width = base.width
  merged.height = base.height
  const ctx = merged.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(base, 0, 0)
  if (draw) ctx.drawImage(draw, 0, 0)

  const blob = await new Promise<Blob | null>((resolve) =>
    merged.toBlob((b) => resolve(b), 'image/png')
  )
  if (!blob) {
    error('图片导出失败')
    return null
  }

  const dataUrl = merged.toDataURL('image/png')
  const filename = `edited-${props.task?.id || Date.now()}.png`
  const file = new File([blob], filename, { type: 'image/png' })

  return { dataUrl, file, sourceUrl: props.imageUrl }
}

const exporting = ref(false)

async function handleDone() {
  exporting.value = true
  try {
    const result = await exportImage()
    if (!result) return
    emit('done', result)
    emit('update:modelValue', false)
    success('编辑完成，正在加入参考图...')
  } catch (e) {
    error(e, '导出失败')
  } finally {
    exporting.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

// ─── Watch dialog open ───
function handleKeydown(e: KeyboardEvent) {
  if (e.code === 'Space' && !spacePressed.value) {
    // Don't intercept when typing in an input
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    spacePressed.value = true
  }
}
function handleKeyup(e: KeyboardEvent) {
  if (e.code === 'Space') {
    spacePressed.value = false
  }
}

watch(() => props.modelValue, (visible) => {
  if (visible && props.imageUrl) {
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('keyup', handleKeyup)
    nextTick(() => loadImage(props.imageUrl!))
  } else {
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('keyup', handleKeyup)
    spacePressed.value = false
    isPanning.value = false
    // Reset state on close
    objects.value = []
    redoStack.value = []
    cropMode.value = false
    cropRect.value = null
    currentTool.value = 'brush'
    zoom.value = 1
    pan.value = { x: 0, y: 0 }
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
})

// Cursor based on tool
function canvasCursor(): string {
  if (cropMode.value) return 'crosshair'
  if (currentTool.value === 'text') return 'text'
  if (currentTool.value === 'eraser') return 'cell'
  return 'crosshair'
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="图片编辑"
    width="90%"
    top="3vh"
    :close-on-click-modal="false"
    @update:model-value="close"
  >
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <div class="tool-group">
        <el-button-group>
          <el-button
            size="small"
            :icon="EditPen"
            :type="currentTool === 'brush' && !cropMode ? 'primary' : 'default'"
            @click="cropMode = false; currentTool = 'brush'"
          >画笔</el-button>
          <el-button
            size="small"
            :type="currentTool === 'eraser' && !cropMode ? 'primary' : 'default'"
            @click="cropMode = false; currentTool = 'eraser'"
          >橡皮</el-button>
          <el-button
            size="small"
            :type="currentTool === 'text' && !cropMode ? 'primary' : 'default'"
            @click="cropMode = false; currentTool = 'text'"
          >文字</el-button>
          <el-dropdown trigger="click" @command="(cmd: ShapeType) => { cropMode = false; currentTool = 'shape'; currentShape = cmd }">
            <el-button
              size="small"
              :type="currentTool === 'shape' && !cropMode ? 'primary' : 'default'"
            >
              形状<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rect" :class="{ active: currentShape === 'rect' }">矩形</el-dropdown-item>
                <el-dropdown-item command="circle" :class="{ active: currentShape === 'circle' }">圆形</el-dropdown-item>
                <el-dropdown-item command="line" :class="{ active: currentShape === 'line' }">直线</el-dropdown-item>
                <el-dropdown-item command="arrow" :class="{ active: currentShape === 'arrow' }">箭头</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button
            size="small"
            :icon="Crop"
            :type="cropMode ? 'primary' : 'default'"
            @click="toggleCrop"
          >裁剪</el-button>
        </el-button-group>
      </div>

      <div class="tool-group" v-if="!cropMode && (currentTool === 'brush' || currentTool === 'eraser')">
        <label class="tool-label">颜色</label>
        <el-color-picker v-model="brushColor" size="small" :predefine="['#ff4d4f', '#faad14', '#52c41a', '#1677ff', '#722ed1', '#000000']" />
        <label class="tool-label">粗细</label>
        <el-slider v-model="brushSize" :min="1" :max="40" :step="1" style="width: 100px;" size="small" />
        <span class="tool-value">{{ brushSize }}px</span>
      </div>

      <div class="tool-group" v-if="!cropMode && currentTool === 'shape'">
        <label class="tool-label">颜色</label>
        <el-color-picker v-model="brushColor" size="small" :predefine="['#ff4d4f', '#faad14', '#52c41a', '#1677ff', '#722ed1', '#000000']" />
        <label class="tool-label">线宽</label>
        <el-slider v-model="strokeWidth" :min="1" :max="20" :step="1" style="width: 100px;" size="small" />
        <span class="tool-value">{{ strokeWidth }}px</span>
      </div>

      <div class="tool-group" v-if="!cropMode && currentTool === 'text'">
        <label class="tool-label">文字颜色</label>
        <el-color-picker v-model="textColor" size="small" :predefine="['#ff4d4f', '#faad14', '#52c41a', '#1677ff', '#722ed1', '#000000']" />
        <label class="tool-label">字号</label>
        <el-slider v-model="fontSize" :min="10" :max="72" :step="1" style="width: 100px;" size="small" />
        <span class="tool-value">{{ fontSize }}px</span>
      </div>

      <div class="tool-group" v-if="cropMode">
        <el-button size="small" type="primary" :icon="Check" @click="applyCrop">确认裁剪</el-button>
        <el-button size="small" :icon="Close" @click="cancelCrop">取消裁剪</el-button>
      </div>

      <div class="tool-spacer"></div>

      <div class="tool-group" v-if="!cropMode">
        <el-button size="small" :icon="ZoomOut" @click="zoomOut" :title="`缩小 (当前 ${Math.round(zoom * 100)}%)`"></el-button>
        <span class="zoom-display">{{ Math.round(zoom * 100) }}%</span>
        <el-button size="small" :icon="ZoomIn" @click="zoomIn" title="放大"></el-button>
        <el-button size="small" :icon="Aim" @click="resetZoom" title="重置缩放"></el-button>
      </div>

      <div class="tool-group" v-if="!cropMode">
        <el-button size="small" :icon="RefreshLeft" :disabled="objects.length === 0" @click="undo" title="撤销">撤销</el-button>
        <el-button size="small" :icon="Back" :disabled="redoStack.length === 0" @click="redo" title="重做">重做</el-button>
        <el-button size="small" :icon="Delete" :disabled="objects.length === 0" @click="clearAll" title="清空">清空</el-button>
      </div>
    </div>

    <!-- Canvas area -->
    <div ref="canvasArea" class="editor-canvas-area"
      :style="{ cursor: isPanning ? 'grabbing' : (spacePressed ? 'grab' : undefined) }"
      @wheel.prevent="onWheel"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
    >
      <!-- Loading overlay (canvas stays mounted underneath) -->
      <div v-if="imageLoading" class="editor-placeholder editor-overlay">
        <el-icon class="is-loading" :size="40"><Loading /></el-icon>
        <span>正在加载图片...</span>
      </div>
      <!-- Error overlay -->
      <div v-else-if="imageError" class="editor-placeholder editor-overlay editor-error">
        <el-icon :size="40"><Picture /></el-icon>
        <span>{{ imageError }}</span>
      </div>
      <!-- Canvas container: always rendered so refs are available when image loads -->
      <div ref="canvasWrap" class="editor-canvas-wrap" :class="{ 'is-hidden': imageLoading || imageError }">
        <canvas ref="baseCanvas" class="editor-canvas base-canvas"></canvas>
        <canvas
          ref="drawCanvas"
          class="editor-canvas draw-canvas"
          :style="{ cursor: canvasCursor() }"
          @mousedown.prevent="onMouseDown"
        ></canvas>
        <!-- Crop overlay -->
        <div
          v-if="cropMode && cropRect"
          class="crop-rect"
          :style="{
            left: cropRect.x * baseScale + 'px',
            top: cropRect.y * baseScale + 'px',
            width: cropRect.w * baseScale + 'px',
            height: cropRect.h * baseScale + 'px',
          }"
        ></div>
        <!-- Text input overlay -->
        <input
          v-if="textInputVisible"
          v-model="textInputValue"
          class="editor-text-input"
          :style="{
            left: textInputPos.x + 'px',
            top: textInputPos.y + 'px',
            fontSize: fontSize * baseScale + 'px',
            color: textColor,
          }"
          @keydown.enter.prevent="commitText"
          @keydown.escape.prevent="cancelText"
          @blur="commitText"
          placeholder="输入文字..."
        />
      </div>
    </div>

    <!-- Footer -->
    <template #footer>
      <div class="editor-footer">
        <div class="footer-info" v-if="imageWidth > 0">
          <span>{{ imageWidth }} × {{ imageHeight }} px</span>
          <span v-if="objects.length > 0">· {{ objects.length }} 个标注</span>
          <span class="footer-hint">· 滚轮缩放 · 按住空格拖拽</span>
        </div>
        <div class="footer-actions">
          <el-button @click="close">取消</el-button>
          <el-button type="primary" :loading="exporting" :disabled="imageLoading || !!imageError" @click="handleDone">
            完成编辑
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 0 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 14px;
}
.tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tool-label {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.tool-value {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  min-width: 36px;
}
.tool-spacer {
  flex: 1;
}
.zoom-display {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  min-width: 40px;
  text-align: center;
}

.editor-canvas-area {
  position: relative;
  height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
}
.editor-placeholder {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: var(--momo-font-size-sm);
}
.editor-overlay {
  pointer-events: none;
}
.editor-error {
  color: var(--el-color-danger);
}
.editor-canvas-wrap {
  position: relative;
  display: inline-block;
  line-height: 0;
}
.editor-canvas-wrap.is-hidden {
  visibility: hidden;
}
.editor-canvas {
  display: block;
  max-width: 100%;
}
.base-canvas {
  position: relative;
}
.draw-canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.crop-rect {
  position: absolute;
  border: 2px dashed var(--el-color-primary);
  background: rgba(22, 119, 255, 0.1);
  pointer-events: none;
  z-index: 10;
}

.editor-text-input {
  position: absolute;
  z-index: 20;
  background: rgba(255, 255, 255, 0.9);
  border: 1px dashed var(--el-color-primary);
  border-radius: var(--momo-radius-sm);
  padding: 2px 6px;
  outline: none;
  font-family: sans-serif;
  min-width: 80px;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.footer-info {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  display: flex;
  gap: 8px;
}
.footer-hint {
  color: var(--el-text-color-placeholder);
}
.footer-actions {
  display: flex;
  gap: 8px;
}

.el-dropdown-menu .active {
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
