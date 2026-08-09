import { Router } from 'express'
import { db } from '../db/index.js'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { bjToday } from '../utils/datetime.js'

// ────────────────────────────────────────────────────────────
//  作品库
//  用户从已完成的生图任务一键发布作品，展示结果图 + 模式/提示词/参数，
//  其他人可浏览学习并「一键同款」复用参数。先发后审（admin 可下架）。
// ────────────────────────────────────────────────────────────

export const worksRouter = Router()
worksRouter.use(authMiddleware)

// 给作品行附加发布者信息和标签
function attachExtras(rows: any[], userId: number): any[] {
  if (rows.length === 0) return rows
  const ids = rows.map((r) => r.id)

  // 发布者信息
  const userStmt = db.prepare(`SELECT id, username, nickname FROM users WHERE id = ?`)
  // 当前用户的互动状态
  const today = bjToday()
  const likeStmt = db.prepare(`SELECT 1 FROM work_likes WHERE user_id = ? AND work_id = ? AND like_date = ?`)
  const favStmt = db.prepare(`SELECT 1 FROM work_favorites WHERE user_id = ? AND work_id = ?`)
  // 标签
  const tagStmt = db.prepare(`
    SELECT t.id, t.name FROM work_tags t
    INNER JOIN work_tag_relations r ON t.id = r.tag_id
    WHERE r.work_id = ?
  `)

  return rows.map((r: any) => {
    const user = userStmt.get(r.user_id) as any
    const tags = tagStmt.all(r.id) as any[]
    return {
      ...r,
      prompt_segments: safeParseJson(r.prompt_segments, {}),
      reference_image_urls: safeParseJson(r.reference_image_urls, []),
      author: user ? { id: user.id, username: user.username, nickname: user.nickname } : null,
      tags,
      is_liked: !!likeStmt.get(userId, r.id, today),
      is_favorited: !!favStmt.get(userId, r.id),
      is_official: !!r.is_official,
    }
  })
}

function safeParseJson(text: string | null | undefined, fallback: any): any {
  try {
    return JSON.parse(text || '{}') || fallback
  } catch {
    return fallback
  }
}

// 排序子句
function sortClause(sort?: string): string {
  switch (sort) {
    case 'hot':
      return 'ORDER BY w.like_count DESC, w.created_at DESC'
    case 'most_reused':
      return 'ORDER BY w.reuse_count DESC, w.created_at DESC'
    case 'latest':
    default:
      return 'ORDER BY w.created_at DESC'
  }
}

// GET /api/works  作品广场（瀑布流）
worksRouter.get('/', (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(60, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const offset = (page - 1) * pageSize
    const sort = (req.query.sort as string) || 'latest'
    const featureId = req.query.feature_id as string | undefined
    const tagId = req.query.tag_id ? parseInt(req.query.tag_id as string) : undefined
    const keyword = (req.query.keyword as string | undefined)?.trim() || ''
    const scope = (req.query.scope as string) || 'gallery' // gallery | mine | favorites

    const params: any[] = []
    const conditions: string[] = []
    let joins = ''

    // scope 决定基础范围
    if (scope === 'mine') {
      conditions.push('w.user_id = ?')
      params.push(req.user!.userId)
    } else if (scope === 'favorites') {
      joins += ' INNER JOIN work_favorites wf ON w.id = wf.work_id AND wf.user_id = ?'
      params.push(req.user!.userId)
    } else {
      // gallery: 默认只看已发布
      conditions.push("w.status = 'published'")
    }

    if (featureId) {
      if (featureId === 'free-gen') {
        conditions.push("(w.feature_id = 'free-gen' OR w.feature_id IS NULL)")
      } else {
        conditions.push('w.feature_id = ?')
        params.push(featureId)
      }
    }

    if (tagId) {
      joins += ' INNER JOIN work_tag_relations wr ON w.id = wr.work_id AND wr.tag_id = ?'
      params.push(tagId)
    }

    if (keyword) {
      conditions.push('(w.prompt LIKE ?)')
      params.push(`%${keyword}%`)
    }

    const whereSql = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const fromSql = `FROM works w${joins} ${whereSql}`

    const { total } = db.prepare(`SELECT COUNT(DISTINCT w.id) as total ${fromSql}`).get(...params) as any

    const columns = `
      SELECT DISTINCT w.id, w.user_id, w.remark, w.image_url, w.thumb_url,
        w.prompt, w.user_prompt, w.prompt_segments, w.negative_prompt,
        w.model, w.resolution, w.aspect_ratio, w.feature_id,
        w.reference_image_urls, w.source_task_id, w.status, w.is_official,
        w.like_count, w.favorite_count, w.reuse_count, w.view_count,
        w.created_at
    `
    const records = db.prepare(
      `${columns} ${fromSql} ${sortClause(sort)} LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as any[]

    res.json({
      success: true,
      data: {
        records: attachExtras(records, req.user!.userId),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (err: any) {
    console.error('[works] List error:', err.message)
    res.status(500).json({ success: false, error: '加载作品列表失败: ' + err.message })
  }
})

// GET /api/works/tags  全局作品标签列表（带使用数）
worksRouter.get('/tags', (_req, res) => {
  const tags = db.prepare(`
    SELECT t.id, t.name, COUNT(r.work_id) as usage_count, t.created_at
    FROM work_tags t
    LEFT JOIN work_tag_relations r ON t.id = r.tag_id
    LEFT JOIN works w ON r.work_id = w.id AND w.status = 'published'
    GROUP BY t.id
    ORDER BY usage_count DESC, t.name ASC
  `).all()
  res.json({ success: true, data: tags })
})

// GET /api/works/:id  作品详情
worksRouter.get('/:id', (req: AuthRequest, res) => {
  try {
    const row = db.prepare(`
      SELECT w.*, u.username, u.nickname
      FROM works w
      LEFT JOIN users u ON w.user_id = u.id
      WHERE w.id = ?
    `).get(req.params.id) as any

    if (!row) {
      res.status(404).json({ success: false, error: '作品不存在' })
      return
    }
    // 非公开作品仅作者和管理员可见
    if (row.status !== 'published' && row.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(404).json({ success: false, error: '作品不存在' })
      return
    }

    // 浏览量 +1（不计入作者自己）
    if (row.user_id !== req.user!.userId) {
      db.prepare('UPDATE works SET view_count = view_count + 1 WHERE id = ?').run(req.params.id)
    }

    const tags = db.prepare(`
      SELECT t.id, t.name FROM work_tags t
      INNER JOIN work_tag_relations r ON t.id = r.tag_id
      WHERE r.work_id = ?
    `).all(req.params.id) as any[]

    const today = bjToday()
    const isLiked = !!db.prepare(`SELECT 1 FROM work_likes WHERE user_id = ? AND work_id = ? AND like_date = ?`).get(req.user!.userId, req.params.id, today)
    const isFavorited = !!db.prepare('SELECT 1 FROM work_favorites WHERE user_id = ? AND work_id = ?').get(req.user!.userId, req.params.id)

    const result = {
      ...row,
      prompt_segments: safeParseJson(row.prompt_segments, {}),
      reference_image_urls: safeParseJson(row.reference_image_urls, []),
      is_official: !!row.is_official,
      author: { id: row.user_id, username: row.username, nickname: row.nickname },
      tags,
      is_liked: isLiked,
      is_favorited: isFavorited,
    }

    res.json({ success: true, data: result })
  } catch (err: any) {
    console.error('[works] Detail error:', err.message)
    res.status(500).json({ success: false, error: '加载作品详情失败: ' + err.message })
  }
})

// POST /api/works  从任务发布作品
worksRouter.post('/', (req: AuthRequest, res) => {
  try {
    const { source_task_id, remark, tagIds } = req.body || {}
    if (!source_task_id) {
      res.status(400).json({ success: false, error: '缺少来源任务 ID' })
      return
    }

    // 查任务，必须属于当前用户且已完成、有结果图
    const task = db.prepare(`
      SELECT id, user_id, status, model, prompt, user_prompt, prompt_segments, negative_prompt,
        resolution, aspect_ratio, feature_id, input_image_urls, result_image_urls
      FROM generation_tasks WHERE id = ? AND user_id = ?
    `).get(source_task_id, req.user!.userId) as any

    if (!task) {
      res.status(404).json({ success: false, error: '任务不存在或不属于当前用户' })
      return
    }
    if (task.status !== 'completed') {
      res.status(400).json({ success: false, error: '任务尚未完成，无法发布' })
      return
    }
    const resultUrls = safeParseJson(task.result_image_urls, []) as string[]
    if (resultUrls.length === 0) {
      res.status(400).json({ success: false, error: '任务没有结果图，无法发布' })
      return
    }

    // 防重复发布：同一任务只能发布一次
    const existing = db.prepare('SELECT id FROM works WHERE source_task_id = ?').get(source_task_id) as any
    if (existing) {
      res.status(409).json({ success: false, error: '该任务已发布过作品' })
      return
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    const workRemark = remark ? String(remark).trim().slice(0, 500) : ''
    const refUrls = safeParseJson(task.input_image_urls, [])
    const imageUrl = resultUrls[0]

    const insertWork = db.prepare(`
      INSERT INTO works
        (id, user_id, title, description, remark, image_url, thumb_url, prompt, user_prompt,
         prompt_segments, negative_prompt, model, resolution, aspect_ratio, feature_id,
         reference_image_urls, source_task_id, status, created_at, updated_at)
      VALUES (?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
    `)
    const insertTagRelation = db.prepare('INSERT OR IGNORE INTO work_tag_relations (work_id, tag_id) VALUES (?, ?)')

    const tx = db.transaction(() => {
      insertWork.run(
        id, req.user!.userId, workRemark,
        imageUrl, imageUrl,
        task.prompt, task.user_prompt || '',
        task.prompt_segments || '{}', task.negative_prompt || '',
        task.model, task.resolution, task.aspect_ratio, task.feature_id,
        JSON.stringify(refUrls), source_task_id, now, now
      )
      if (Array.isArray(tagIds)) {
        for (const tid of tagIds) insertTagRelation.run(id, tid)
      }
    })
    tx()

    const row = db.prepare('SELECT * FROM works WHERE id = ?').get(id) as any
    res.json({ success: true, data: { ...row, prompt_segments: safeParseJson(row.prompt_segments, {}), reference_image_urls: safeParseJson(row.reference_image_urls, []), is_official: !!row.is_official } })
  } catch (err: any) {
    console.error('[works] Publish error:', err.message)
    res.status(500).json({ success: false, error: '发布失败: ' + err.message })
  }
})

// POST /api/works/:id/like  点赞（每人每天可赞一次，可给自己的作品点赞）
// 已赞今天 -> 取消今天的点赞（like_count -1）；今天未赞 -> 新增今日点赞（like_count +1）
worksRouter.post('/:id/like', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const work = db.prepare("SELECT id, user_id FROM works WHERE id = ? AND status = 'published'").get(id) as any
    if (!work) {
      res.status(404).json({ success: false, error: '作品不存在' })
      return
    }
    const today = bjToday()
    const existing = db.prepare(`SELECT 1 FROM work_likes WHERE user_id = ? AND work_id = ? AND like_date = ?`).get(req.user!.userId, id, today)
    const tx = db.transaction(() => {
      if (existing) {
        // 取消今天的点赞
        db.prepare(`DELETE FROM work_likes WHERE user_id = ? AND work_id = ? AND like_date = ?`).run(req.user!.userId, id, today)
        db.prepare('UPDATE works SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(id)
      } else {
        // 新增今天的点赞（OR IGNORE 防并发重复）
        db.prepare(`INSERT OR IGNORE INTO work_likes (user_id, work_id, like_date) VALUES (?, ?, ?)`).run(req.user!.userId, id, today)
        db.prepare('UPDATE works SET like_count = like_count + 1 WHERE id = ?').run(id)
      }
    })
    tx()
    const { like_count } = db.prepare('SELECT like_count FROM works WHERE id = ?').get(id) as any
    res.json({ success: true, data: { is_liked: !existing, like_count } })
  } catch (err: any) {
    console.error('[works] Like error:', err.message)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// POST /api/works/:id/favorite  收藏/取消（toggle）
worksRouter.post('/:id/favorite', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const work = db.prepare("SELECT id FROM works WHERE id = ? AND status = 'published'").get(id) as any
    if (!work) {
      res.status(404).json({ success: false, error: '作品不存在' })
      return
    }
    const existing = db.prepare('SELECT 1 FROM work_favorites WHERE user_id = ? AND work_id = ?').get(req.user!.userId, id)
    const tx = db.transaction(() => {
      if (existing) {
        db.prepare('DELETE FROM work_favorites WHERE user_id = ? AND work_id = ?').run(req.user!.userId, id)
        db.prepare('UPDATE works SET favorite_count = MAX(0, favorite_count - 1) WHERE id = ?').run(id)
      } else {
        db.prepare('INSERT OR IGNORE INTO work_favorites (user_id, work_id) VALUES (?, ?)').run(req.user!.userId, id)
        db.prepare('UPDATE works SET favorite_count = favorite_count + 1 WHERE id = ?').run(id)
      }
    })
    tx()
    const { favorite_count } = db.prepare('SELECT favorite_count FROM works WHERE id = ?').get(id) as any
    res.json({ success: true, data: { is_favorited: !existing, favorite_count } })
  } catch (err: any) {
    console.error('[works] Favorite error:', err.message)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// POST /api/works/:id/reuse  记录复用并返回完整参数
worksRouter.post('/:id/reuse', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const work = db.prepare(`
      SELECT id, prompt, user_prompt, model, resolution, aspect_ratio, feature_id,
        reference_image_urls
      FROM works WHERE id = ? AND status = 'published'
    `).get(id) as any
    if (!work) {
      res.status(404).json({ success: false, error: '作品不存在' })
      return
    }
    // 复用次数 +1
    db.prepare('UPDATE works SET reuse_count = reuse_count + 1 WHERE id = ?').run(id)
    res.json({
      success: true,
      data: {
        model: work.model,
        prompt: work.prompt,
        userPrompt: work.user_prompt || '',
        resolution: work.resolution,
        aspectRatio: work.aspect_ratio,
        feature_id: work.feature_id,
        input_image_urls: safeParseJson(work.reference_image_urls, []),
      },
    })
  } catch (err: any) {
    console.error('[works] Reuse error:', err.message)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// PATCH /api/works/:id/remark  更新备注（仅作者或管理员）
worksRouter.patch('/:id/remark', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const work = db.prepare('SELECT id, user_id FROM works WHERE id = ?').get(id) as any
    if (!work) {
      res.status(404).json({ success: false, error: '作品不存在' })
      return
    }
    if (work.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: '无权修改他人作品备注' })
      return
    }
    const remark = (req.body?.remark != null ? String(req.body.remark) : '').slice(0, 500)
    db.prepare('UPDATE works SET remark = ?, updated_at = ? WHERE id = ?').run(remark, new Date().toISOString(), id)
    res.json({ success: true, data: { remark } })
  } catch (err: any) {
    console.error('[works] Remark error:', err.message)
    res.status(500).json({ success: false, error: '更新备注失败' })
  }
})

// DELETE /api/works/:id  删除自己的作品
worksRouter.delete('/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const work = db.prepare('SELECT id, user_id FROM works WHERE id = ?').get(id) as any
    if (!work) {
      res.status(404).json({ success: false, error: '作品不存在' })
      return
    }
    // 仅作者或管理员可删
    if (work.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: '无权删除他人作品' })
      return
    }
    // ON DELETE CASCADE 会清理 work_tag_relations / work_likes / work_favorites
    db.prepare('DELETE FROM works WHERE id = ?').run(id)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[works] Delete error:', err.message)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})
