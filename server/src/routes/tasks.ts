import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { bjDateRangeClause } from '../utils/datetime.js'
import { isStoredUrl } from '../utils/storage.js'

function parseRow(row: any): any {
  if (!row) return row
  const parsed = { ...row }
  for (const key of ['template_image_ids', 'input_image_urls', 'result_image_urls', 'raw_error', 'supplementary_images', 'prompt_segments']) {
    if (typeof parsed[key] === 'string') {
      try { parsed[key] = JSON.parse(parsed[key]) } catch { /* keep as-is */ }
    }
  }
  // suite-gen 透传字段
  if ('suite_id' in parsed) {
    parsed.suiteId = parsed.suite_id
    delete parsed.suite_id
  }
  if ('point_index' in parsed) {
    parsed.pointIndex = parsed.point_index
    delete parsed.point_index
  }
  // Map snake_case DB column to camelCase frontend field
  if ('aspect_ratio' in parsed) {
    parsed.aspectRatio = parsed.aspect_ratio
    delete parsed.aspect_ratio
  }
  if ('supplementary_images' in parsed) {
    parsed.supplementaryImages = parsed.supplementary_images
    delete parsed.supplementary_images
  }
  if (Array.isArray(parsed.result_image_urls)) {
    parsed.result_image_urls = parsed.result_image_urls.filter(isStoredUrl)
  }
  return parsed
}

export const tasksRouter = Router()

tasksRouter.use(authMiddleware)

// List user's tasks
tasksRouter.get('/', (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20
  const status = req.query.status as string | undefined
  const model = req.query.model as string | undefined
  const featureId = req.query.feature_id as string | undefined
  const suiteId = req.query.suiteId as string | undefined
  const startDate = req.query.start_date as string | undefined
  const endDate = req.query.end_date as string | undefined

  let where = 'WHERE user_id = ?'
  const params: any[] = [req.user!.userId]

  if (status) {
    where += ' AND status = ?'
    params.push(status)
  }
  if (model) {
    where += ' AND model = ?'
    params.push(model)
  }
  if (featureId) {
    where += ' AND feature_id = ?'
    params.push(featureId)
  }
  if (suiteId) {
    where += ' AND suite_id = ?'
    params.push(suiteId)
  }
  const range = bjDateRangeClause('created_at', startDate, endDate)
  if (range.clause) {
    where += range.clause
    params.push(...range.params)
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM generation_tasks ${where}`).get(...params) as any
  const rows = db.prepare(
    `SELECT * FROM generation_tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize)

  res.json({
    success: true,
    data: {
      records: (rows as any[]).map(parseRow),
      total: countRow.total,
      page,
      pageSize,
    },
  })
})

// Get single task
tasksRouter.get('/:id', (req: AuthRequest, res) => {
  const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(
    req.params.id, req.user!.userId
  )

  if (!task) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  res.json({ success: true, data: parseRow(task) })
})

// Create task record — 已退役（编排层 POST /api/generations 取代），保留 410 一个过渡版本
tasksRouter.post('/', (req: AuthRequest, res) => {
  res.status(410).json({
    success: false,
    error: '任务创建已由服务端编排接管（POST /api/generations），旧端点退役。请刷新页面使用新版本。',
  })
})

// Update task status/result — 已退役（状态同步职责在编排层），保留 410 一个过渡版本
tasksRouter.patch('/:id', (req: AuthRequest, res) => {
  res.status(410).json({
    success: false,
    error: '任务状态同步已由服务端编排接管（GET /api/generations/:id/status），旧端点退役。',
  })
})

// Delete task
tasksRouter.delete('/:id', (req: AuthRequest, res) => {
  const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(
    req.params.id, req.user!.userId
  ) as any

  if (!task) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  db.prepare('DELETE FROM generation_tasks WHERE id = ?').run(req.params.id)
  res.json({ success: true, data: { id: req.params.id } })
})
