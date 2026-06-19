import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { calculateCost } from '../utils/pricing.js'
import { resolveUserApiKey } from '../utils/toapis.js'
import { bjDateRangeClause } from '../utils/datetime.js'

function isOssResultUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    return new URL(url).hostname.endsWith('.aliyuncs.com')
  } catch {
    return false
  }
}

function parseRow(row: any): any {
  if (!row) return row
  const parsed = { ...row }
  for (const key of ['template_image_ids', 'input_image_urls', 'result_image_urls', 'raw_error', 'supplementary_images']) {
    if (typeof parsed[key] === 'string') {
      try { parsed[key] = JSON.parse(parsed[key]) } catch { /* keep as-is */ }
    }
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
    parsed.result_image_urls = parsed.result_image_urls.filter(isOssResultUrl)
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

// Create task record (after getting toapis_task_id)
tasksRouter.post('/', (req: AuthRequest, res) => {
  const {
    toapis_task_id, client_business_id, model, prompt, size, resolution,
    aspect_ratio, n, template_image_ids, input_image_urls, status, progress,
    feature_id, user_prompt, supplementary_images,
  } = req.body

  if (!toapis_task_id || !model || !prompt) {
    res.status(400).json({ success: false, error: '缺少必要参数：toapis_task_id, model, prompt' })
    return
  }

  const userId = req.user!.userId
  const count = n || 1
  // 个人 key 模式不消耗积分（cost=0，跳过余额校验/扣减/流水）
  const isPersonal = resolveUserApiKey(userId).mode === 'personal'
  const cost = isPersonal ? 0 : calculateCost(model, resolution || '', count)

  try {
    const txn = db.transaction(() => {
      // Check balance
      const user = db.prepare('SELECT points FROM users WHERE id = ?').get(userId) as any
      if (!user) {
        throw { status: 404, error: '用户不存在' }
      }

      const currentBalance = user.points ?? 0
      if (!isPersonal && currentBalance < cost) {
        throw {
          status: 402,
          error: `积分不足，需要 ${cost} 积分，当前仅有 ${Math.round(currentBalance * 1000) / 1000} 积分`,
          data: { required: cost, available: Math.round(currentBalance * 1000) / 1000 }
        }
      }

      const newBalance = Math.round((currentBalance - cost) * 1000) / 1000

      // Insert task（个人模式 points_cost 记 0，仍写记录保证任务列表可见）
      const result = db.prepare(`
        INSERT INTO generation_tasks (user_id, toapis_task_id, client_business_id, model, prompt, size, resolution, aspect_ratio, n, template_image_ids, input_image_urls, status, progress, feature_id, user_prompt, points_cost, points_balance_after, supplementary_images)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, toapis_task_id, client_business_id || null, model, prompt,
        size || null, resolution || null, aspect_ratio || null, count,
        template_image_ids ? JSON.stringify(template_image_ids) : null,
        input_image_urls ? JSON.stringify(input_image_urls) : null,
        status || 'submitted', progress || 0,
        feature_id || null,
        user_prompt || '',
        cost,
        newBalance,
        supplementary_images ? JSON.stringify(supplementary_images) : '[]'
      )

      const taskId = result.lastInsertRowid

      // 仅共享模式扣减积分 + 写流水（个人模式不消耗积分）
      if (!isPersonal) {
        db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newBalance, userId)

        db.prepare(`
          INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, note, created_at)
          VALUES (?, ?, ?, 'generation', 'generation_task', ?, '', CURRENT_TIMESTAMP)
        `).run(userId, -cost, newBalance, taskId)
      }

      return taskId
    })

    const taskId = txn()
    res.json({ success: true, data: { id: taskId } })
  } catch (e: any) {
    if (e.status && e.error) {
      res.status(e.status).json({ success: false, error: e.error, data: e.data })
      return
    }
    throw e
  }
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

  if (
    req.body.result_image_urls !== undefined
    && (
      !Array.isArray(req.body.result_image_urls)
      || !req.body.result_image_urls.every(isOssResultUrl)
    )
  ) {
    res.status(400).json({ success: false, error: '结果图片必须先转存到 OSS' })
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
