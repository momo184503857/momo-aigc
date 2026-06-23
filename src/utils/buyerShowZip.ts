/**
 * 买家秀：打包下载 + 行→TaskItem 转换的共享工具。
 * 供「制作买家秀」工作区与「任务历史」详情页共用。
 */
import JSZip from 'jszip'
import { toBJDate } from '@/utils/datetime'
import type { TaskItem } from '@/components/TaskList.vue'
import type { ModelId } from '@/types/adapter'

/** 可打包下载的行（仅需 id / productId / 首张结果图 URL） */
export interface ZipRow {
  id: number
  productId: string
  resultUrl?: string
}

// 跨域图片抓取：优先 OSS 直 fetch，失败回落 /api/proxy/image
async function fetchImageBlob(url: string): Promise<{ blob: Blob; contentType: string } | null> {
  try {
    const resp = await fetch(url, { cache: 'force-cache' })
    if (resp.ok) return { blob: await resp.blob(), contentType: resp.headers.get('content-type') || '' }
  } catch { /* fall back to proxy */ }
  try {
    const token = localStorage.getItem('auth_token')
    const resp = await fetch('/api/proxy/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ url }),
    })
    if (resp.ok) return { blob: await resp.blob(), contentType: resp.headers.get('content-type') || '' }
  } catch { /* give up */ }
  return null
}

function sanitizeName(name: string): string {
  return (name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'image'
}

/**
 * 打包下载结果图 zip：按 productId 命名，同 ID 重复加 _2/_3。
 * @returns 成功打包的张数（0 表示全部抓取失败）
 */
export async function downloadRowsAsZip(rows: ZipRow[], zipNameBase: string): Promise<number> {
  if (rows.length === 0) return 0
  const zip = new JSZip()
  const used = new Map<string, number>()
  let ok = 0
  for (const row of rows) {
    if (!row.resultUrl) continue
    const fetched = await fetchImageBlob(row.resultUrl)
    if (!fetched) continue
    const ext = fetched.contentType.includes('jpeg') ? 'jpg' : 'png'
    const base = sanitizeName(row.productId || `image_${row.id}`)
    const c = used.get(base) || 0
    used.set(base, c + 1)
    const filename = c === 0 ? `${base}.${ext}` : `${base}_${c + 1}.${ext}`
    zip.file(filename, fetched.blob)
    ok++
  }
  if (ok === 0) return 0
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${zipNameBase}_${toBJDate(new Date().toISOString())}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return ok
}

/** 行结构（工作区 TableRow / 历史详情行共用所需字段） */
export interface RowForCompare {
  taskId: number | null
  toapisTaskId: string | null
  prompt: string
  model?: string
  resolution?: string
  aspectRatio?: string
  status: string
  progress: number
  resultImageUrls?: string[]
  inputImageUrls?: string[]
  mainImageUrl?: string
  errorMsg?: string
}

/** 把买家秀行转换为 ImageCompareDialog 所需的 TaskItem（无 taskId 返回 null） */
export function rowToTaskItem(
  row: RowForCompare,
  fallback: { model: ModelId; resolution: string; aspectRatio: string }
): TaskItem | null {
  if (!row.taskId) return null
  return {
    id: row.taskId,
    toapis_task_id: row.toapisTaskId || '',
    model: (row.model || fallback.model) as ModelId,
    prompt: row.prompt,
    resolution: row.resolution || fallback.resolution,
    aspectRatio: row.aspectRatio || fallback.aspectRatio,
    status: row.status,
    progress: row.progress,
    result_image_urls: row.resultImageUrls || [],
    input_image_urls:
      row.inputImageUrls && row.inputImageUrls.length
        ? row.inputImageUrls
        : row.mainImageUrl
          ? [row.mainImageUrl]
          : [],
    template_image_ids: [],
    error_message: row.errorMsg || '',
    created_at: '',
    completed_at: null,
    feature_id: 'buyer-show',
  }
}
