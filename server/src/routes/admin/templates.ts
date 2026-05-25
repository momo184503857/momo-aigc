import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'

export const adminTemplatesRouter = Router()

adminTemplatesRouter.use(authMiddleware, adminMiddleware)

// List all templates
adminTemplatesRouter.get('/', (req: AuthRequest, res) => {
  const userId = req.query.user_id as string | undefined

  let where = "WHERE ti.status = 'active'"
  const params: any[] = []

  if (userId) {
    where += ' AND ti.user_id = ?'
    params.push(userId)
  }

  const rows = db.prepare(`
    SELECT ti.*, u.username
    FROM template_images ti
    LEFT JOIN users u ON ti.user_id = u.id
    ${where}
    ORDER BY ti.created_at DESC
  `).all(...params)

  res.json({ success: true, data: rows })
})

// Delete template (admin - hard delete record, not OSS file)
adminTemplatesRouter.delete('/:id', (req: AuthRequest, res) => {
  const result = db.prepare(
    "UPDATE template_images SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(req.params.id)

  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '模板图不存在' })
    return
  }

  res.json({ success: true })
})
