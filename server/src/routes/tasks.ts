import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const tasksRouter = Router()

tasksRouter.use(authMiddleware)

// List user's tasks
tasksRouter.get('/', (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20
  const status = req.query.status as string | undefined
  const model = req.query.model as string | undefined

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

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM generation_tasks ${where}`).get(...params) as any
  const rows = db.prepare(
    `SELECT * FROM generation_tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize)

  res.json({
    success: true,
    data: {
      records: rows,
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

  res.json({ success: true, data: task })
})

// Create task record (after getting toapis_task_id)
tasksRouter.post('/', (req: AuthRequest, res) => {
  const {
    toapis_task_id, client_business_id, model, prompt, size, resolution,
    n, template_image_ids, input_image_urls, status, progress,
  } = req.body

  if (!toapis_task_id || !model || !prompt) {
    res.status(400).json({ success: false, error: '缺少必要参数：toapis_task_id, model, prompt' })
    return
  }

  const result = db.prepare(`
    INSERT INTO generation_tasks (user_id, toapis_task_id, client_business_id, model, prompt, size, resolution, n, template_image_ids, input_image_urls, status, progress)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user!.userId, toapis_task_id, client_business_id || null, model, prompt,
    size || null, resolution || null, n || 1,
    template_image_ids ? JSON.stringify(template_image_ids) : null,
    input_image_urls ? JSON.stringify(input_image_urls) : null,
    status || 'submitted', progress || 0
  )

  res.json({ success: true, data: { id: result.lastInsertRowid } })
})

// Update task status/result
tasksRouter.patch('/:id', (req: AuthRequest, res) => {
  const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(
    req.params.id, req.user!.userId
  ) as any

  if (!task) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  const fields: string[] = []
  const params: any[] = []

  const updatable = [
    'status', 'progress', 'result_image_urls', 'error_code', 'error_message',
    'raw_error', 'completed_at', 'expires_at',
  ]

  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`)
      const val = req.body[key]
      if (['result_image_urls', 'raw_error'].includes(key) && typeof val === 'object') {
        params.push(JSON.stringify(val))
      } else {
        params.push(val)
      }
    }
  }

  if (fields.length === 0) {
    res.status(400).json({ success: false, error: '无更新字段' })
    return
  }

  fields.push('updated_at = CURRENT_TIMESTAMP')
  params.push(req.params.id)

  db.prepare(`UPDATE generation_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params)

  res.json({ success: true, data: { id: req.params.id } })
})
