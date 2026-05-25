import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const templatesRouter = Router()

templatesRouter.use(authMiddleware)

// List templates
templatesRouter.get('/', (req: AuthRequest, res) => {
  const templates = db
    .prepare(
      'SELECT * FROM template_images WHERE user_id = ? AND status = ? ORDER BY created_at DESC'
    )
    .all(req.user!.userId, 'active')

  res.json({ success: true, data: templates })
})

// Create template record
templatesRouter.post('/', (req: AuthRequest, res) => {
  const {
    name, oss_bucket, oss_object_key, public_url,
    original_filename, mime_type, size_bytes, width, height,
  } = req.body

  if (!oss_bucket || !oss_object_key || !public_url) {
    res.status(400).json({ success: false, error: '缺少 OSS 文件信息' })
    return
  }

  const result = db.prepare(`
    INSERT INTO template_images (user_id, name, oss_bucket, oss_object_key, public_url, original_filename, mime_type, size_bytes, width, height)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user!.userId, name || null, oss_bucket, oss_object_key, public_url,
    original_filename || null, mime_type || null, size_bytes || null, width || null, height || null
  )

  res.json({ success: true, data: { id: result.lastInsertRowid } })
})

// Soft delete template
templatesRouter.delete('/:id', (req: AuthRequest, res) => {
  const tmpl = db.prepare('SELECT * FROM template_images WHERE id = ? AND user_id = ?').get(
    req.params.id, req.user!.userId
  ) as any

  if (!tmpl) {
    res.status(404).json({ success: false, error: '模板图不存在' })
    return
  }

  db.prepare(
    "UPDATE template_images SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(req.params.id)

  res.json({ success: true })
})

// Rename template
templatesRouter.patch('/:id', (req: AuthRequest, res) => {
  const { name } = req.body
  if (!name) {
    res.status(400).json({ success: false, error: '请提供模板名称' })
    return
  }

  const result = db.prepare(
    'UPDATE template_images SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(name, req.params.id, req.user!.userId)

  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '模板图不存在' })
    return
  }

  res.json({ success: true })
})
