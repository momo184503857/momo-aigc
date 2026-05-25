import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'

function parseRow(row: any): any {
  if (!row) return row
  const parsed = { ...row }
  for (const key of ['template_image_ids', 'input_image_urls', 'result_image_urls', 'raw_error']) {
    if (typeof parsed[key] === 'string') {
      try { parsed[key] = JSON.parse(parsed[key]) } catch { /* keep as-is */ }
    }
  }
  if ('aspect_ratio' in parsed) {
    parsed.aspectRatio = parsed.aspect_ratio
    delete parsed.aspect_ratio
  }
  return parsed
}

export const adminTasksRouter = Router()

adminTasksRouter.use(authMiddleware, adminMiddleware)

// List all tasks
adminTasksRouter.get('/', (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20
  const status = req.query.status as string | undefined
  const userId = req.query.user_id as string | undefined

  let where = 'WHERE 1=1'
  const params: any[] = []

  if (status) {
    where += ' AND t.status = ?'
    params.push(status)
  }
  if (userId) {
    where += ' AND t.user_id = ?'
    params.push(userId)
  }

  const countRow = db.prepare(
    `SELECT COUNT(*) as total FROM generation_tasks t ${where}`
  ).get(...params) as any

  const rows = db.prepare(`
    SELECT t.*, u.username
    FROM generation_tasks t
    LEFT JOIN users u ON t.user_id = u.id
    ${where}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize)

  res.json({
    success: true,
    data: { records: (rows as any[]).map(parseRow), total: countRow.total, page, pageSize },
  })
})

// Delete a task (admin)
adminTasksRouter.delete('/:id', (req: AuthRequest, res) => {
  const result = db.prepare('DELETE FROM generation_tasks WHERE id = ?').run(req.params.id)
  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }
  res.json({ success: true })
})
