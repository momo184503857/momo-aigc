import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const templatesRouter = Router()

templatesRouter.use(authMiddleware)

// ─── Tags ───

// List tags with usage counts
templatesRouter.get('/tags', (req: AuthRequest, res) => {
  const tags = db.prepare(`
    SELECT t.id, t.name, COUNT(it.tag_id) as usage_count, t.created_at
    FROM gallery_tags t
    LEFT JOIN template_image_tags it ON t.id = it.tag_id
    LEFT JOIN template_images ti ON it.template_image_id = ti.id AND ti.status = 'active'
    WHERE t.user_id = ?
    GROUP BY t.id
    ORDER BY usage_count DESC, t.name ASC
  `).all(req.user!.userId)

  res.json({ success: true, data: tags })
})

// Create tag
templatesRouter.post('/tags', (req: AuthRequest, res) => {
  const { name } = req.body
  if (!name || !name.trim()) {
    res.status(400).json({ success: false, error: '标签名不能为空' })
    return
  }

  const existing = db.prepare(
    'SELECT id FROM gallery_tags WHERE user_id = ? AND name = ?'
  ).get(req.user!.userId, name.trim()) as any

  if (existing) {
    res.json({ success: true, data: { id: existing.id, name: name.trim() } })
    return
  }

  const result = db.prepare(
    'INSERT INTO gallery_tags (user_id, name) VALUES (?, ?)'
  ).run(req.user!.userId, name.trim())

  res.json({ success: true, data: { id: result.lastInsertRowid, name: name.trim() } })
})

// ─── Templates ───

function parseRow(r: any) {
  return {
    ...r,
    tags: r.tags ? JSON.parse(r.tags) : [],
  }
}

// List templates with pagination and tag filtering
templatesRouter.get('/', (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const tagId = req.query.tagId ? parseInt(req.query.tagId as string) : undefined
    const offset = (page - 1) * pageSize
    const userId = req.user!.userId

    let countSql = `SELECT COUNT(DISTINCT ti.id) as total`
    let dataSql = `SELECT DISTINCT ti.*`
    let fromSql = ` FROM template_images ti`
    const params: any[] = []

    if (tagId) {
      fromSql += ` INNER JOIN template_image_tags it ON ti.id = it.template_image_id AND it.tag_id = ?`
      params.push(tagId)
    }

    fromSql += ` WHERE ti.user_id = ? AND ti.status = 'active'`
    params.push(userId)

    countSql += fromSql
    dataSql += fromSql

    // Get total
    const { total } = db.prepare(countSql).get(...params) as any

    // Get page data with aggregated tags
    dataSql += ` ORDER BY ti.created_at DESC LIMIT ? OFFSET ?`
    const dataParams = [...params, pageSize, offset]
    const records = db.prepare(dataSql).all(...dataParams) as any[]

    // Attach tags to each record
    const tagStmt = db.prepare(`
      SELECT gt.id, gt.name
      FROM gallery_tags gt
      INNER JOIN template_image_tags it ON gt.id = it.tag_id
      WHERE it.template_image_id = ?
      ORDER BY gt.name
    `)

    const data = records.map((r: any) => {
      const tags = tagStmt.all(r.id)
      return { ...r, tags }
    })

    res.json({
      success: true,
      data: { records: data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (err: any) {
    console.error('[templates] List error:', err.message)
    res.status(500).json({ success: false, error: '加载图库失败: ' + err.message })
  }
})

// Create template record
templatesRouter.post('/', (req: AuthRequest, res) => {
  const {
    name, oss_bucket, oss_object_key, public_url,
    original_filename, mime_type, size_bytes, width, height,
    tagIds,
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

  const imageId = result.lastInsertRowid

  // Attach tags
  if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
    const insertTag = db.prepare(
      'INSERT OR IGNORE INTO template_image_tags (template_image_id, tag_id) VALUES (?, ?)'
    )
    for (const tagId of tagIds) {
      insertTag.run(imageId, tagId)
    }
  }

  res.json({ success: true, data: { id: imageId } })
})

// Update tags for a template image
templatesRouter.patch('/:id/tags', (req: AuthRequest, res) => {
  const tmpl = db.prepare('SELECT id FROM template_images WHERE id = ? AND user_id = ?').get(
    req.params.id, req.user!.userId
  ) as any

  if (!tmpl) {
    res.status(404).json({ success: false, error: '模板图不存在' })
    return
  }

  const { tagIds } = req.body
  if (!Array.isArray(tagIds)) {
    res.status(400).json({ success: false, error: 'tagIds 必须为数组' })
    return
  }

  // Replace all tags atomically
  const deleteAll = db.prepare('DELETE FROM template_image_tags WHERE template_image_id = ?')
  const insert = db.prepare('INSERT OR IGNORE INTO template_image_tags (template_image_id, tag_id) VALUES (?, ?)')

  const transaction = db.transaction(() => {
    deleteAll.run(req.params.id)
    for (const tagId of tagIds) {
      insert.run(req.params.id, tagId)
    }
  })
  transaction()

  res.json({ success: true })
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
