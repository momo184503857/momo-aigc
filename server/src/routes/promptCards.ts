import { Router } from 'express'
import { db } from '../db/index.js'
import { v4 as uuidv4 } from 'uuid'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { bjToday } from '../utils/datetime.js'

// ────────────────────────────────────────────────────────────
//  提示词工坊 · 卡片社区库
//
//  结构化提示词卡片：模块 + 内容 + 多图（1~10，可置顶）+ 备注。
//  公开浏览、可上传、可点赞（每日1次）/ 收藏 / 复用。先发后审（admin 可下架）。
//  复用：点击卡片「复用」按钮，把内容追加进右侧拼接预览。
// ────────────────────────────────────────────────────────────

export const promptCardsRouter = Router()
promptCardsRouter.use(authMiddleware)

function safeParseJson(text: string | null | undefined, fallback: any): any {
  try {
    return JSON.parse(text || 'null') ?? fallback
  } catch {
    return fallback
  }
}

// 卡片行 → 前端对象（附加作者、模块名、互动状态、cover_url、images 解析）
function attachExtras(rows: any[], userId: number): any[] {
  if (rows.length === 0) return rows
  const userStmt = db.prepare(`SELECT id, username, nickname FROM users WHERE id = ?`)
  const moduleStmt = db.prepare(`SELECT id, name, type FROM prompt_modules WHERE id = ?`)
  const today = bjToday()
  const likeStmt = db.prepare(`SELECT 1 FROM prompt_card_likes WHERE user_id = ? AND card_id = ? AND like_date = ?`)
  const favStmt = db.prepare(`SELECT 1 FROM prompt_card_favorites WHERE user_id = ? AND card_id = ?`)

  return rows.map((r: any) => {
    const user = userStmt.get(r.user_id) as any
    const mod = r.module_id ? (moduleStmt.get(r.module_id) as any) : null
    const images: string[] = safeParseJson(r.images, [])
    const coverIndex = Math.min(Number(r.cover_index) || 0, Math.max(0, images.length - 1))
    return {
      ...r,
      images,
      cover_url: images[coverIndex] || images[0] || '',
      cover_index: coverIndex,
      is_official: !!r.is_official,
      author: user ? { id: user.id, username: user.username, nickname: user.nickname } : null,
      module: mod ? { id: mod.id, name: mod.name, type: mod.type } : null,
      is_liked: !!likeStmt.get(userId, r.id, today),
      is_favorited: !!favStmt.get(userId, r.id),
    }
  })
}

// 排序子句
function sortClause(sort?: string): string {
  switch (sort) {
    case 'hot':
      return 'ORDER BY c.like_count DESC, c.created_at DESC'
    case 'most_reused':
      return 'ORDER BY c.reuse_count DESC, c.created_at DESC'
    case 'latest':
    default:
      return 'ORDER BY c.created_at DESC'
  }
}

// GET /api/prompt-cards/modules  模块列表（用户端只读，用于上传/筛选下拉）
// 放在 /:id 之前，避免被识别成 id
promptCardsRouter.get('/modules', (_req, res) => {
  try {
    const rows = db.prepare(`SELECT id, name, type, sort_order, is_system FROM prompt_modules ORDER BY sort_order ASC, id ASC`).all()
    res.json({
      success: true,
      data: rows.map((r: any) => ({ ...r, is_system: !!r.is_system })),
    })
  } catch (err: any) {
    console.error('[prompt-cards] Modules error:', err.message)
    res.status(500).json({ success: false, error: '加载模块失败' })
  }
})

// GET /api/prompt-cards  卡片列表（瀑布流，服务端分页+筛选）
promptCardsRouter.get('/', (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(60, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const offset = (page - 1) * pageSize
    const sort = (req.query.sort as string) || 'latest'
    const moduleId = req.query.moduleId ? parseInt(req.query.moduleId as string) : undefined
    const keyword = (req.query.keyword as string | undefined)?.trim() || ''
    const scope = (req.query.scope as string) || 'gallery'

    const params: any[] = []
    const conditions: string[] = []
    let joins = ''

    if (scope === 'mine') {
      conditions.push('c.user_id = ?')
      params.push(req.user!.userId)
    } else if (scope === 'favorites') {
      joins += ' INNER JOIN prompt_card_favorites f ON c.id = f.card_id AND f.user_id = ?'
      params.push(req.user!.userId)
    } else {
      // gallery: 默认只看已发布
      conditions.push("c.status = 'published'")
    }

    if (moduleId) {
      conditions.push('c.module_id = ?')
      params.push(moduleId)
    }

    if (keyword) {
      conditions.push('(c.content LIKE ? OR c.remark LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    const whereSql = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const fromSql = `FROM prompt_cards c${joins} ${whereSql}`

    const { total } = db.prepare(`SELECT COUNT(DISTINCT c.id) as total ${fromSql}`).get(...params) as any

    const columns = `
      SELECT DISTINCT c.id, c.user_id, c.module_id, c.content, c.images, c.cover_index,
        c.remark, c.status, c.is_official,
        c.like_count, c.favorite_count, c.reuse_count, c.created_at
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
    console.error('[prompt-cards] List error:', err.message)
    res.status(500).json({ success: false, error: '加载卡片列表失败: ' + err.message })
  }
})

// GET /api/prompt-cards/:id  卡片详情
promptCardsRouter.get('/:id', (req: AuthRequest, res) => {
  try {
    const row = db.prepare(`SELECT c.*, u.username, u.nickname FROM prompt_cards c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`).get(req.params.id) as any
    if (!row) {
      res.status(404).json({ success: false, error: '卡片不存在' })
      return
    }
    // 非公开卡片仅作者和管理员可见
    if (row.status !== 'published' && row.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(404).json({ success: false, error: '卡片不存在' })
      return
    }

    const today = bjToday()
    const isLiked = !!db.prepare(`SELECT 1 FROM prompt_card_likes WHERE user_id = ? AND card_id = ? AND like_date = ?`).get(req.user!.userId, req.params.id, today)
    const isFavorited = !!db.prepare('SELECT 1 FROM prompt_card_favorites WHERE user_id = ? AND card_id = ?').get(req.user!.userId, req.params.id)
    const mod = row.module_id ? (db.prepare(`SELECT id, name, type FROM prompt_modules WHERE id = ?`).get(row.module_id) as any) : null

    const images: string[] = safeParseJson(row.images, [])
    const coverIndex = Math.min(Number(row.cover_index) || 0, Math.max(0, images.length - 1))

    res.json({
      success: true,
      data: {
        ...row,
        images,
        cover_url: images[coverIndex] || images[0] || '',
        cover_index: coverIndex,
        is_official: !!row.is_official,
        author: { id: row.user_id, username: row.username, nickname: row.nickname },
        module: mod,
        is_liked: isLiked,
        is_favorited: isFavorited,
      },
    })
  } catch (err: any) {
    console.error('[prompt-cards] Detail error:', err.message)
    res.status(500).json({ success: false, error: '加载卡片详情失败: ' + err.message })
  }
})

// POST /api/prompt-cards  上传提示词卡片
promptCardsRouter.post('/', (req: AuthRequest, res) => {
  try {
    const { module_id, content, images, cover_index, remark } = req.body || {}
    const trimmedContent = String(content || '').trim()
    if (!trimmedContent) {
      res.status(400).json({ success: false, error: '提示词内容不能为空' })
      return
    }
    if (!module_id) {
      res.status(400).json({ success: false, error: '请选择模块' })
      return
    }
    const mod = db.prepare(`SELECT id FROM prompt_modules WHERE id = ?`).get(module_id) as any
    if (!mod) {
      res.status(400).json({ success: false, error: '所选模块不存在' })
      return
    }
    const imgArr = Array.isArray(images) ? images.filter((u: any) => typeof u === 'string' && u.trim()).map((u: string) => u.trim()) : []
    if (imgArr.length < 1 || imgArr.length > 10) {
      res.status(400).json({ success: false, error: '图片数量需为 1~10 张' })
      return
    }
    let coverIdx = Number(cover_index)
    if (!Number.isFinite(coverIdx) || coverIdx < 0 || coverIdx >= imgArr.length) coverIdx = 0
    const remarkText = String(remark || '').trim().slice(0, 500)

    const id = uuidv4()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO prompt_cards (id, user_id, module_id, content, images, cover_index, remark, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
    `).run(id, req.user!.userId, module_id, trimmedContent, JSON.stringify(imgArr), coverIdx, remarkText, now, now)

    const row = db.prepare(`SELECT * FROM prompt_cards WHERE id = ?`).get(id) as any
    const resultImages: string[] = safeParseJson(row.images, [])
    res.json({
      success: true,
      data: {
        ...row,
        images: resultImages,
        cover_url: resultImages[row.cover_index] || resultImages[0] || '',
        is_official: !!row.is_official,
      },
    })
  } catch (err: any) {
    console.error('[prompt-cards] Create error:', err.message)
    res.status(500).json({ success: false, error: '上传失败: ' + err.message })
  }
})

// POST /api/prompt-cards/:id/like  点赞（每人每天可赞一次，toggle 当日）
promptCardsRouter.post('/:id/like', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const card = db.prepare("SELECT id FROM prompt_cards WHERE id = ? AND status = 'published'").get(id) as any
    if (!card) {
      res.status(404).json({ success: false, error: '卡片不存在' })
      return
    }
    const today = bjToday()
    const existing = db.prepare(`SELECT 1 FROM prompt_card_likes WHERE user_id = ? AND card_id = ? AND like_date = ?`).get(req.user!.userId, id, today)
    const tx = db.transaction(() => {
      if (existing) {
        db.prepare(`DELETE FROM prompt_card_likes WHERE user_id = ? AND card_id = ? AND like_date = ?`).run(req.user!.userId, id, today)
        db.prepare('UPDATE prompt_cards SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(id)
      } else {
        db.prepare(`INSERT OR IGNORE INTO prompt_card_likes (user_id, card_id, like_date) VALUES (?, ?, ?)`).run(req.user!.userId, id, today)
        db.prepare('UPDATE prompt_cards SET like_count = like_count + 1 WHERE id = ?').run(id)
      }
    })
    tx()
    const { like_count } = db.prepare('SELECT like_count FROM prompt_cards WHERE id = ?').get(id) as any
    res.json({ success: true, data: { is_liked: !existing, like_count } })
  } catch (err: any) {
    console.error('[prompt-cards] Like error:', err.message)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// POST /api/prompt-cards/:id/favorite  收藏/取消（toggle）
promptCardsRouter.post('/:id/favorite', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const card = db.prepare("SELECT id FROM prompt_cards WHERE id = ? AND status = 'published'").get(id) as any
    if (!card) {
      res.status(404).json({ success: false, error: '卡片不存在' })
      return
    }
    const existing = db.prepare('SELECT 1 FROM prompt_card_favorites WHERE user_id = ? AND card_id = ?').get(req.user!.userId, id)
    const tx = db.transaction(() => {
      if (existing) {
        db.prepare('DELETE FROM prompt_card_favorites WHERE user_id = ? AND card_id = ?').run(req.user!.userId, id)
        db.prepare('UPDATE prompt_cards SET favorite_count = MAX(0, favorite_count - 1) WHERE id = ?').run(id)
      } else {
        db.prepare('INSERT OR IGNORE INTO prompt_card_favorites (user_id, card_id) VALUES (?, ?)').run(req.user!.userId, id)
        db.prepare('UPDATE prompt_cards SET favorite_count = favorite_count + 1 WHERE id = ?').run(id)
      }
    })
    tx()
    const { favorite_count } = db.prepare('SELECT favorite_count FROM prompt_cards WHERE id = ?').get(id) as any
    res.json({ success: true, data: { is_favorited: !existing, favorite_count } })
  } catch (err: any) {
    console.error('[prompt-cards] Favorite error:', err.message)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// POST /api/prompt-cards/:id/reuse  记录复用并返回卡片内容（供前端追加到拼接预览）
promptCardsRouter.post('/:id/reuse', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const card = db.prepare(`
      SELECT c.id, c.module_id, c.content, m.name AS module_name, m.type AS module_type, m.sort_order
      FROM prompt_cards c LEFT JOIN prompt_modules m ON c.module_id = m.id
      WHERE c.id = ? AND c.status = 'published'
    `).get(id) as any
    if (!card) {
      res.status(404).json({ success: false, error: '卡片不存在' })
      return
    }
    db.prepare('UPDATE prompt_cards SET reuse_count = reuse_count + 1 WHERE id = ?').run(id)
    const { reuse_count } = db.prepare('SELECT reuse_count FROM prompt_cards WHERE id = ?').get(id) as any
    res.json({
      success: true,
      data: {
        id: card.id,
        module_id: card.module_id,
        module_name: card.module_name || '已删除模块',
        module_type: card.module_type || 'element',
        content: card.content,
        reuse_count,
      },
    })
  } catch (err: any) {
    console.error('[prompt-cards] Reuse error:', err.message)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// DELETE /api/prompt-cards/:id  删除卡片（仅作者或管理员）
promptCardsRouter.delete('/:id', (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const card = db.prepare('SELECT id, user_id FROM prompt_cards WHERE id = ?').get(id) as any
    if (!card) {
      res.status(404).json({ success: false, error: '卡片不存在' })
      return
    }
    if (card.user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: '无权删除他人卡片' })
      return
    }
    // ON DELETE CASCADE 会清理 prompt_card_likes / prompt_card_favorites
    db.prepare('DELETE FROM prompt_cards WHERE id = ?').run(id)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[prompt-cards] Delete error:', err.message)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})
