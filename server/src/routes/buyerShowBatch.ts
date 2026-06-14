/**
 * 买家秀批量制作路由（制作买家秀 Tab）
 *
 * 注意：与 ./buyerShow.ts（素材库，由另一模块维护）相互独立，
 * 挂载在 /api/buyer-show-batch，使用独立的 buyer_show_batch_items 表。
 *
 * 职责：持久化用户上传的表格行（商品ID/主图链接/提示词）及其与生图任务的映射，
 * 使刷新/离开后仍能查看进度并按商品ID打包下载。生图本身复用 generation_tasks
 * （feature_id='buyer-show'），故任务会自动出现在全局任务列表中。
 */
import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[]
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

interface BatchItemRecord {
  id: number
  batchId: string
  productId: string
  mainImageUrl: string
  prompt: string
  taskId: number | null
  toapisTaskId: string | null
  status: string
  progress: number
  errorMessage: string | null
  sortOrder: number
  createdAt: string
  model?: string
  resolution?: string
  aspectRatio?: string
  resultImageUrls?: string[]
  inputImageUrls?: string[]
  completedAt?: string | null
}

function mapRow(row: any): BatchItemRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    productId: String(row.product_id ?? ''),
    mainImageUrl: row.main_image_url,
    prompt: row.prompt ?? '',
    taskId: row.task_id ?? null,
    toapisTaskId: row.toapis_task_id ?? null,
    status: row.status,
    progress: row.progress ?? 0,
    errorMessage: row.error_message ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    model: row.model ?? undefined,
    resolution: row.resolution ?? undefined,
    aspectRatio: row.aspect_ratio ?? undefined,
    resultImageUrls:
      row.result_image_urls !== null && row.result_image_urls !== undefined
        ? parseJsonArray(row.result_image_urls)
        : undefined,
    inputImageUrls:
      row.input_image_urls !== null && row.input_image_urls !== undefined
        ? parseJsonArray(row.input_image_urls)
        : undefined,
    completedAt: row.completed_at ?? undefined,
  }
}

export const buyerShowBatchRouter = Router()
buyerShowBatchRouter.use(authMiddleware)

// 列出当前用户的全部条目（左联 generation_tasks 取最新状态/结果）
buyerShowBatchRouter.get('/items', (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      `SELECT
         bi.id, bi.batch_id, bi.product_id, bi.main_image_url, bi.prompt,
         bi.task_id, bi.toapis_task_id,
         COALESCE(NULLIF(gt.status, ''), bi.status) AS status,
         COALESCE(gt.progress, bi.progress, 0) AS progress,
         COALESCE(bi.error_message, gt.error_message) AS error_message,
         bi.sort_order, bi.created_at,
         gt.model, gt.resolution, gt.aspect_ratio,
         gt.result_image_urls, gt.input_image_urls, gt.completed_at
       FROM buyer_show_batch_items bi
       LEFT JOIN generation_tasks gt ON bi.task_id = gt.id
       WHERE bi.user_id = ?
       ORDER BY bi.sort_order ASC, bi.id ASC`
    )
    .all(req.user!.userId) as any[]

  res.json({
    success: true,
    data: { records: rows.map(mapRow), total: rows.length },
  })
})

// 批量新增（一次上传一组）；服务端生成 batch_id
buyerShowBatchRouter.post('/items', (req: AuthRequest, res) => {
  const items = req.body?.items
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: '缺少 items' })
    return
  }

  const userId = req.user!.userId
  const batchId = String(Date.now())
  const insert = db.prepare(
    `INSERT INTO buyer_show_batch_items
       (user_id, batch_id, product_id, main_image_url, prompt, status, progress, sort_order)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`
  )

  const ids: number[] = []
  const txn = db.transaction((rows: any[]) => {
    rows.forEach((r, i) => {
      const info = insert.run(
        userId,
        batchId,
        String(r?.productId ?? '').trim(),
        String(r?.mainImageUrl ?? '').trim(),
        String(r?.prompt ?? '').trim(),
        i
      )
      ids.push(Number(info.lastInsertRowid))
    })
  })
  txn(items)

  res.json({ success: true, data: { batchId, ids } })
})

// 更新单条（改提示词，或回写任务链接/状态）
buyerShowBatchRouter.patch('/items/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const existing = db
    .prepare('SELECT id FROM buyer_show_batch_items WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '条目不存在' })
    return
  }

  const allowed = ['prompt', 'task_id', 'toapis_task_id', 'status', 'progress', 'error_message']
  const fields: string[] = []
  const params: any[] = []
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`)
      params.push(req.body[key])
    }
  }
  if (fields.length === 0) {
    res.status(400).json({ success: false, error: '无更新字段' })
    return
  }
  fields.push('updated_at = CURRENT_TIMESTAMP')
  params.push(req.params.id)

  db.prepare(`UPDATE buyer_show_batch_items SET ${fields.join(', ')} WHERE id = ?`).run(...params)
  res.json({ success: true, data: { id: Number(req.params.id) } })
})

// 删除单条（属主校验）
buyerShowBatchRouter.delete('/items/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const existing = db
    .prepare('SELECT id FROM buyer_show_batch_items WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '条目不存在' })
    return
  }
  db.prepare('DELETE FROM buyer_show_batch_items WHERE id = ?').run(req.params.id)
  res.json({ success: true, data: { id: Number(req.params.id) } })
})

// 清空当前用户的全部条目（「清空」按钮）
buyerShowBatchRouter.delete('/all', (req: AuthRequest, res) => {
  const info = db
    .prepare('DELETE FROM buyer_show_batch_items WHERE user_id = ?')
    .run(req.user!.userId)
  res.json({ success: true, data: { deleted: info.changes } })
})
