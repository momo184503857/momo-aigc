/**
 * AI画布 Pro+ 独立 API 层（React island 自包含，禁止 import vue/@/services/@/stores）。
 *
 * 只走既有服务端接口（零新增业务逻辑）：
 * /api/rf-canvas/*（项目 CRUD）/api/models/catalog /api/canvas-ai/chat
 * /api/generations(+/:id/status) /api/oss/(mode|upload|upload-token)
 */
import axios, { type AxiosInstance } from 'axios'
import type { GraphJSON, ImageCatalogModel, TextCatalogGroup } from './types'

const httpFor: AxiosInstance = axios.create({ baseURL: '/api', timeout: 15000 })

httpFor.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

httpFor.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/#/login'
    }
    return Promise.reject(err)
  }
)

export { httpFor }

/** 从 axios 错误中提取后端 error 文案（节点失败提示用） */
export function extractErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string }; status?: number }; message?: string; code?: string; name?: string }
  if (e?.response?.data?.error) return e.response.data.error
  if (e?.code === 'ERR_CANCELED' || e?.code === 'ERR_ABORTED' || e?.name === 'CanceledError' || e?.name === 'AbortError') {
    return '已停止'
  }
  if (e?.response?.status) return `${fallback}（HTTP ${e.response.status}）`
  if (e?.message) return e.message
  return fallback
}

// ─── 模型目录（60s 模块级缓存，R9.1/A7.4）───

let imageCatalogCache: { at: number; data: ImageCatalogModel[] } | null = null
let textCatalogCache: { at: number; data: TextCatalogGroup[] } | null = null
const CATALOG_TTL_MS = 60_000

export async function fetchImageCatalog(force = false): Promise<ImageCatalogModel[]> {
  if (!force && imageCatalogCache && Date.now() - imageCatalogCache.at < CATALOG_TTL_MS) {
    return imageCatalogCache.data
  }
  const res = await httpFor.get<{ data: { models: ImageCatalogModel[] } }>('/models/catalog', {
    params: { kind: 'image' },
  })
  imageCatalogCache = { at: Date.now(), data: res.data.data.models ?? [] }
  return imageCatalogCache.data
}

export async function fetchTextCatalog(force = false): Promise<TextCatalogGroup[]> {
  if (!force && textCatalogCache && Date.now() - textCatalogCache.at < CATALOG_TTL_MS) {
    return textCatalogCache.data
  }
  const res = await httpFor.get<{ data: { platform: TextCatalogGroup[] } }>('/models/catalog', {
    params: { kind: 'text' },
  })
  textCatalogCache = { at: Date.now(), data: res.data.data.platform ?? [] }
  return textCatalogCache.data
}

// ─── 文字 AI（/api/canvas-ai/chat；不计积分）───

export interface ChatImage {
  mimeType: string
  base64: string
}

export interface ChatParams {
  channelModelId: number
  prompt: string
  images?: ChatImage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export async function chat(params: ChatParams): Promise<{ text: string }> {
  const res = await httpFor.post(
    '/canvas-ai/chat',
    {
      channelModelId: params.channelModelId,
      messages: [{ role: 'user', content: params.prompt }],
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      images: params.images?.length ? params.images : undefined,
    },
    { timeout: 900_000, signal: params.signal }
  )
  return res.data.data as { text: string }
}

// ─── 生图（POST /api/generations + 阻塞轮询 3s×120；服务端预扣/退款）───

export interface GenerateImageParams {
  logicalModelId: number
  prompt: string
  aspectRatio: string
  resolution: string
  /** 已上传为站内 URL 的参考图 */
  refImageUrls: string[]
  n: number
  signal?: AbortSignal
}

export interface GenerateImageResult {
  taskNo: string
  dbTaskId: number
  resultUrls: string[]
  status: 'completed' | 'failed'
  errorMessage?: string
}

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 120

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const res = await httpFor.post(
    '/generations',
    {
      logicalModelId: params.logicalModelId,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      refImageUrls: params.refImageUrls,
      featureId: 'rf-canvas',
      n: params.n,
    },
    { timeout: 90_000, signal: params.signal }
  )
  const data = res.data.data as { tasks: Array<{ id: number; taskNo: string; status: string }> }
  const first = data.tasks[0]
  if (!first) throw new Error('生图任务提交失败：未返回任务')

  // 全局任务面板感知新任务（Vue 侧 useTaskManager 监听该事件刷新列表）
  window.dispatchEvent(new CustomEvent('canvas:task-created'))

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, POLL_INTERVAL_MS)
      params.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(t)
          reject(new DOMException('Aborted', 'AbortError'))
        },
        { once: true }
      )
    })
    if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    let status: string
    let resultUrls: string[] = []
    let errorMessage: string | undefined
    try {
      const st = await httpFor.get(`/generations/${first.id}/status`, { signal: params.signal })
      status = st.data.data.status
      resultUrls = st.data.data.resultUrls ?? []
      errorMessage = st.data.data.errorMessage
    } catch (err) {
      if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      // 单次状态请求失败继续轮询（对齐主站 pollTask 容错）
      console.warn('[rf-canvas] status 轮询单次失败，继续:', err)
      continue
    }

    if (status === 'completed') {
      return { taskNo: first.taskNo, dbTaskId: first.id, resultUrls, status: 'completed' }
    }
    if (status === 'failed') {
      return {
        taskNo: first.taskNo,
        dbTaskId: first.id,
        resultUrls: [],
        status: 'failed',
        errorMessage: errorMessage || '生成失败',
      }
    }
  }
  return {
    taskNo: first.taskNo,
    dbTaskId: first.id,
    resultUrls: [],
    status: 'failed',
    errorMessage: '生图超时（6 分钟），费用已自动退款',
  }
}

// ─── 图片上传（双模式，D11：对齐 src/services/ossApi.ts 的 upload()）───

export async function getStorageMode(): Promise<{ mode: 'direct' | 'oss'; ossHost: string }> {
  const res = await httpFor.get('/oss/mode')
  return res.data.data
}

export async function uploadImage(file: File): Promise<{ url: string; objectKey: string }> {
  const { mode } = await getStorageMode()
  if (mode === 'direct') {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('scope', 'inputs')
    const res = await httpFor.post('/oss/upload', fd, { timeout: 120_000 })
    const d = res.data.data as { objectKey: string; publicUrl: string }
    return { url: d.publicUrl, objectKey: d.objectKey }
  }

  const tokenRes = await httpFor.post('/oss/upload-token', {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    scope: 'inputs',
  })
  const token = tokenRes.data.data as {
    uploadUrl: string
    objectKey: string
    publicUrl: string
    fields: Record<string, string>
  }
  const formData = new FormData()
  for (const [key, value] of Object.entries(token.fields)) {
    formData.append(key, value)
  }
  formData.append('file', file)
  const resp = await fetch(token.uploadUrl, { method: 'POST', body: formData })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`OSS 直传失败 (${resp.status})${text ? `: ${text}` : ''}`)
  }
  return { url: token.publicUrl, objectKey: token.objectKey }
}

// ─── 站内图片 URL → { mimeType, base64 }（text-ai vision 输入）───

export async function urlToBase64Image(url: string): Promise<ChatImage> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`参考图读取失败（HTTP ${resp.status}）`)
  const blob = await resp.blob()
  const mimeType = blob.type || 'image/png'
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return { mimeType, base64: btoa(binary) }
}

// ─── 项目（编辑器内自动保存用）───

export const projectApi = {
  async get(projectId: number): Promise<{ name: string; graph: GraphJSON }> {
    const res = await httpFor.get(`/rf-canvas/projects/${projectId}`)
    return res.data.data
  },
}
