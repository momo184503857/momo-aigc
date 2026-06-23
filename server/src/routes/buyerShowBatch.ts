/**
 * 买家秀批量制作路由（制作买家秀 Tab + 任务历史 Tab）
 *
 * 注意：与 ./buyerShow.ts（素材库，由另一模块维护）相互独立，
 * 挂载在 /api/buyer-show-batch，使用独立的 buyer_show_batch_items / buyer_show_batches 表。
 *
 * 职责：持久化用户上传的表格行（商品ID/主图链接/提示词）及其与生图任务的映射，
 * 使刷新/离开后仍能查看进度并按商品ID打包下载。生图本身复用 generation_tasks
 * （feature_id='buyer-show'），故任务会自动出现在全局任务列表中。
 *
 * 任务历史：一个 batch_id = 一个「任务」。buyer_show_batches 存批次元数据，
 * status='active' 为当前工作区任务，'archived' 为已进任务历史。
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
  n?: number
  resultImageUrls?: string[]
  inputImageUrls?: string[]
  completedAt?: string | null
}

interface BatchRecord {
  id: number
  userId: number
  batchId: string
  name: string
  status: 'active' | 'archived'
  createdAt: string
  archivedAt: string | null
  itemCount: number
  completedCount: number
  failedCount: number
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
    n: row.n ?? undefined,
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

function mapBatchRow(row: any): BatchRecord {
  return {
    id: row.id,
    userId: row.user_id,
    batchId: row.batch_id,
    name: row.name ?? '',
    status: row.status,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? null,
    itemCount: row.item_count ?? 0,
    completedCount: row.completed_count ?? 0,
    failedCount: row.failed_count ?? 0,
  }
}

// 共享：按条件查询 batch_items（左联 generation_tasks 取最新状态/结果）
function fetchItems(userId: number, opts: { batchId?: string; activeOnly?: boolean }): any[] {
  const where: string[] = ['bi.user_id = ?']
  const params: any[] = [userId]
  if (opts.batchId) {
    where.push('bi.batch_id = ?')
    params.push(opts.batchId)
  } else if (opts.activeOnly) {
    where.push(
      `bi.batch_id IN (SELECT batch_id FROM buyer_show_batches WHERE user_id = ? AND status = 'active')`
    )
    params.push(userId)
  }
  return db
    .prepare(
      `SELECT
         bi.id, bi.batch_id, bi.product_id, bi.main_image_url, bi.prompt,
         bi.task_id, bi.toapis_task_id,
         COALESCE(NULLIF(gt.status, ''), bi.status) AS status,
         COALESCE(gt.progress, bi.progress, 0) AS progress,
         COALESCE(bi.error_message, gt.error_message) AS error_message,
         bi.sort_order, bi.created_at,
         gt.model, gt.resolution, gt.aspect_ratio, gt.n,
         gt.result_image_urls, gt.input_image_urls, gt.completed_at
       FROM buyer_show_batch_items bi
       LEFT JOIN generation_tasks gt ON bi.task_id = gt.id
       WHERE ${where.join(' AND ')}
       ORDER BY bi.sort_order ASC, bi.id ASC`
    )
    .all(...params) as any[]
}

export const buyerShowBatchRouter = Router()
buyerShowBatchRouter.use(authMiddleware)

// ── batch_items ──

// 列出条目：默认只返回当前任务（active 批次，工作区用）；?batchId= 指定批次
buyerShowBatchRouter.get('/items', (req: AuthRequest, res) => {
  const batchId = typeof req.query.batchId === 'string' ? req.query.batchId : undefined
  const rows = fetchItems(req.user!.userId, { batchId, activeOnly: !batchId })
  res.json({
    success: true,
    data: { records: rows.map(mapRow), total: rows.length },
  })
})

// 批量新增（一次上传一组 = 开启新任务）：
// 先把当前用户所有 active 批次归档，再为新 batch_id 建 active 元数据，最后插行。
buyerShowBatchRouter.post('/items', (req: AuthRequest, res) => {
  const items = req.body?.items
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: '缺少 items' })
    return
  }

  const userId = req.user!.userId
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const batchId = String(Date.now())

  const insertItem = db.prepare(
    `INSERT INTO buyer_show_batch_items
       (user_id, batch_id, product_id, main_image_url, prompt, status, progress, sort_order)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`
  )
  const archiveOld = db.prepare(
    `UPDATE buyer_show_batches SET status = 'archived', archived_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND status = 'active'`
  )
  const insertBatchMeta = db.prepare(
    `INSERT INTO buyer_show_batches (user_id, batch_id, name, status) VALUES (?, ?, ?, 'active')`
  )

  const ids: number[] = []
  const txn = db.transaction((rows: any[]) => {
    archiveOld.run(userId) // 归档旧的当前任务
    insertBatchMeta.run(userId, batchId, name) // 新建 active 元数据
    rows.forEach((r, i) => {
      const info = insertItem.run(
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
// 注意：前端传 camelCase（taskId/toapisTaskId/errorMessage），这里归一化到 snake_case 列名，
// 否则 task_id 写不进表 → 刷新后 LEFT JOIN 取不到结果图。
buyerShowBatchRouter.patch('/items/:id', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const existing = db
    .prepare('SELECT id FROM buyer_show_batch_items WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '条目不存在' })
    return
  }

  // snake_case 列 → 可接受的 camelCase 入参 key
  const snakeToCamel: Record<string, string> = {
    task_id: 'taskId',
    toapis_task_id: 'toapisTaskId',
    error_message: 'errorMessage',
  }
  const allowed = ['prompt', 'task_id', 'toapis_task_id', 'status', 'progress', 'error_message']
  const fields: string[] = []
  const params: any[] = []
  for (const col of allowed) {
    const camelKey = snakeToCamel[col]
    let val: any
    if (req.body[col] !== undefined) val = req.body[col]
    else if (camelKey && req.body[camelKey] !== undefined) val = req.body[camelKey]
    if (val !== undefined) {
      fields.push(`${col} = ?`)
      params.push(val)
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

// ── batches（任务历史）──

// 列出当前用户的批次（默认仅 archived 历史；?includeActive=1 也返回 active）
buyerShowBatchRouter.get('/batches', (req: AuthRequest, res) => {
  const includeActive =
    req.query.includeActive === '1' || req.query.includeActive === 'true'
  const statusFilter = includeActive ? undefined : 'archived'
  const rows = db
    .prepare(
      `SELECT b.id, b.user_id, b.batch_id, b.name, b.status, b.created_at, b.archived_at,
              COUNT(bi.id) AS item_count,
              SUM(CASE WHEN COALESCE(NULLIF(gt.status, ''), bi.status) = 'completed' THEN 1 ELSE 0 END) AS completed_count,
              SUM(CASE WHEN COALESCE(NULLIF(gt.status, ''), bi.status) = 'failed'    THEN 1 ELSE 0 END) AS failed_count
       FROM buyer_show_batches b
       LEFT JOIN buyer_show_batch_items bi ON bi.batch_id = b.batch_id AND bi.user_id = b.user_id
       LEFT JOIN generation_tasks gt ON bi.task_id = gt.id
       WHERE b.user_id = ? ${statusFilter ? 'AND b.status = ?' : ''}
       GROUP BY b.id
       ORDER BY b.created_at DESC, b.id DESC`
    )
    .all(req.user!.userId, ...(statusFilter ? [statusFilter] : [])) as any[]

  res.json({
    success: true,
    data: { records: rows.map(mapBatchRow), total: rows.length },
  })
})

// 某批次的全部行（任务详情）
buyerShowBatchRouter.get('/batches/:batchId/items', (req: AuthRequest, res) => {
  const existing = db
    .prepare('SELECT id FROM buyer_show_batches WHERE batch_id = ? AND user_id = ?')
    .get(req.params.batchId, req.user!.userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }
  const rows = fetchItems(req.user!.userId, { batchId: String(req.params.batchId) })
  res.json({
    success: true,
    data: { records: rows.map(mapRow), total: rows.length },
  })
})

// 改名 / 手动归档（status 仅允许 active→archived）
buyerShowBatchRouter.patch('/batches/:batchId', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const existing = db
    .prepare('SELECT id, status FROM buyer_show_batches WHERE batch_id = ? AND user_id = ?')
    .get(req.params.batchId, userId) as { id: number; status: string } | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  const fields: string[] = []
  const params: any[] = []
  if (typeof req.body?.name === 'string') {
    fields.push('name = ?')
    params.push(req.body.name.trim())
  }
  if (req.body?.status === 'archived' && existing.status === 'active') {
    fields.push(`status = 'archived'`)
    fields.push('archived_at = CURRENT_TIMESTAMP')
  }
  if (fields.length === 0) {
    res.status(400).json({ success: false, error: '无更新字段' })
    return
  }
  params.push(req.params.batchId)

  db.prepare(`UPDATE buyer_show_batches SET ${fields.join(', ')} WHERE batch_id = ?`).run(...params)
  res.json({ success: true, data: { batchId: req.params.batchId } })
})

// 删除整个任务（元数据 + 行；generation_tasks 保留，因其为全局任务列表）
buyerShowBatchRouter.delete('/batches/:batchId', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const existing = db
    .prepare('SELECT id FROM buyer_show_batches WHERE batch_id = ? AND user_id = ?')
    .get(req.params.batchId, userId)
  if (!existing) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM buyer_show_batch_items WHERE batch_id = ? AND user_id = ?').run(
      req.params.batchId,
      userId
    )
    db.prepare('DELETE FROM buyer_show_batches WHERE batch_id = ? AND user_id = ?').run(
      req.params.batchId,
      userId
    )
  })
  txn()
  res.json({ success: true, data: { batchId: req.params.batchId } })
})

// 清空当前用户的全部条目与批次（管理员/调试用途；前端「清空当前任务」走 DELETE /batches/:batchId）
buyerShowBatchRouter.delete('/all', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const txn = db.transaction(() => {
    const info = db.prepare('DELETE FROM buyer_show_batch_items WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM buyer_show_batches WHERE user_id = ?').run(userId)
    return info.changes
  })
  const deleted = txn()
  res.json({ success: true, data: { deleted } })
})
