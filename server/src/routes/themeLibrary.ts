/**
 * 主题库（用户端 /api/themes）。
 *
 * 数据复用 sg_themes（成套生图资产，管理员在「成套生图资产管理」维护）：
 *   - owner_user_id NULL   = 管理员配置的全局主题（全员可见）
 *   - owner_user_id = X    = 用户 X 上传的主题（默认私有，is_public=1 时对全员可见）
 * 收藏存 sg_theme_favorites（联合主键防重），favorite_count 为计数冗余。
 */
import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const themeLibraryRouter = Router()
themeLibraryRouter.use(authMiddleware)

const MAX_IMAGES = 5
const VALID_SEASONS = ['春', '夏', '秋', '冬']
const VALID_LEVELS = ['L', 'M', 'H']

function parseJsonArray(text: unknown): string[] {
  try {
    const v = JSON.parse(String(text ?? '[]'))
    return Array.isArray(v) ? v.map((x) => String(x)) : []
  } catch {
    return []
  }
}

function sanitizeStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max)
}

function sanitizeImages(v: unknown): string[] {
  return sanitizeStringArray(v, MAX_IMAGES).filter((s) => /^https?:\/\//.test(s))
}

function getTheme(id: number): any {
  return db.prepare(`SELECT * FROM sg_themes WHERE id = ?`).get(id)
}

function idNum(v: string | string[]): number {
  return parseInt(Array.isArray(v) ? v[0] : v)
}

function getTrackName(key: string): string {
  if (!key) return ''
  const row = db.prepare(`SELECT name FROM sg_tracks WHERE key = ? AND owner_user_id IS NULL`).get(key) as any
  return row?.name || key
}

/** DB 行 → 前端对象（解析 JSON 列、附带赛道名/作者/归属/收藏状态） */
function decorate(row: any, userId: number): any {
  const isGlobal = row.owner_user_id === null || row.owner_user_id === undefined
  const images = parseJsonArray(row.images)
  let author: { id: number; username: string; nickname: string | null } | null = null
  if (!isGlobal) {
    const u = db.prepare(`SELECT id, username, nickname FROM users WHERE id = ?`).get(row.owner_user_id) as any
    if (u) author = { id: u.id, username: u.username, nickname: u.nickname }
  }
  const fav = db.prepare(`SELECT 1 AS one FROM sg_theme_favorites WHERE user_id = ? AND theme_id = ?`)
    .get(userId, row.id)
  return {
    id: row.id,
    name: row.name,
    track_key: row.track_key,
    track_name: getTrackName(row.track_key),
    season: parseJsonArray(row.season),
    styles: parseJsonArray(row.styles),
    images,
    cover_url: images[0] || '',
    level: row.level,
    path: row.path,
    points: parseJsonArray(row.points),
    use_count: row.use_count || 0,
    favorite_count: row.favorite_count || 0,
    sort_order: row.sort_order || 0,
    is_public: !!row.is_public,
    is_global: isGlobal,
    is_mine: row.owner_user_id === userId,
    is_favorited: !!fav,
    author,
    created_at: row.created_at,
  }
}

// GET /api/themes  主题列表（筛选 + 搜索 + 排序 + 分页）
themeLibraryRouter.get('/', (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(60, Math.max(1, parseInt(req.query.pageSize as string) || 24))
    const offset = (page - 1) * pageSize
    const scope = (req.query.scope as string) || 'all'
    const sort = (req.query.sort as string) || 'default'
    const keyword = ((req.query.keyword as string) || '').trim()
    const trackKey = (req.query.track_key as string) || ''
    const season = (req.query.season as string) || ''
    const style = (req.query.style as string) || ''
    const level = (req.query.level as string) || ''

    const params: any[] = []
    const conditions: string[] = [`t.status = 'active'`]
    let joins = ''

    if (scope === 'mine') {
      conditions.push('t.owner_user_id = ?')
      params.push(req.user!.userId)
    } else if (scope === 'favorites') {
      joins += ' INNER JOIN sg_theme_favorites f ON t.id = f.theme_id AND f.user_id = ?'
      params.push(req.user!.userId)
    } else if (scope === 'official') {
      conditions.push('t.owner_user_id IS NULL')
    } else {
      // all：管理员配置的全局主题 + 我的主题 + 其他用户公开的主题
      conditions.push('(t.owner_user_id IS NULL OR t.owner_user_id = ? OR t.is_public = 1)')
      params.push(req.user!.userId)
    }

    if (keyword) {
      conditions.push('(t.name LIKE ? OR t.path LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (trackKey) {
      conditions.push('t.track_key = ?')
      params.push(trackKey)
    }
    if (season === 'none') {
      conditions.push(`t.season = '[]'`) // 全季主题
    } else if (season) {
      // JSON 数组元素包含匹配；'[]'（全季）视为满足任意季节
      conditions.push(`(t.season = '[]' OR t.season LIKE ?)`)
      params.push(`%"${season}"%`)
    }
    if (style) {
      conditions.push('t.styles LIKE ?')
      params.push(`%"${style}"%`)
    }
    if (level) {
      conditions.push('t.level = ?')
      params.push(level)
    }

    const whereSql = 'WHERE ' + conditions.join(' AND ')
    const fromSql = `FROM sg_themes t${joins} ${whereSql}`

    // 默认排序：官方主题在前（按管理端 sort_order），用户主题随后
    const orderSql = (() => {
      switch (sort) {
        case 'latest': return 'ORDER BY t.created_at DESC, t.id DESC'
        case 'hot': return 'ORDER BY t.use_count DESC, t.id DESC'
        case 'favorite': return 'ORDER BY t.favorite_count DESC, t.id DESC'
        default: return 'ORDER BY (t.owner_user_id IS NULL) DESC, t.sort_order ASC, t.id ASC'
      }
    })()

    const { total } = db.prepare(`SELECT COUNT(*) AS total ${fromSql}`).get(...params) as any
    const rows = db.prepare(`SELECT t.* ${fromSql} ${orderSql} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset) as any[]

    res.json({
      success: true,
      data: {
        records: rows.map((r) => decorate(r, req.user!.userId)),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (err: any) {
    console.error('[themes] list error:', err.message)
    res.status(500).json({ success: false, error: '加载主题列表失败' })
  }
})

// POST /api/themes  上传自己的主题（默认私有，可选公开）
themeLibraryRouter.post('/', (req: AuthRequest, res) => {
  try {
    const body = req.body || {}
    const name = String(body.name ?? '').trim()
    if (!name) {
      res.status(400).json({ success: false, error: '请填写主题名称' })
      return
    }
    const images = sanitizeImages(body.images)
    if (images.length === 0) {
      res.status(400).json({ success: false, error: '至少上传 1 张主题图片' })
      return
    }
    const season = sanitizeStringArray(body.season, 4).filter((s) => VALID_SEASONS.includes(s))
    const styles = sanitizeStringArray(body.styles, 3)
    const level = VALID_LEVELS.includes(body.level) ? body.level : 'M'
    const points = sanitizeStringArray(body.points, 10)
    const isPublic = body.is_public === true || body.is_public === 1 ? 1 : 0

    const result = db.prepare(`
      INSERT INTO sg_themes (owner_user_id, name, track_key, season, styles, images, level, path, points, status, sort_order, source, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 'user', ?)
    `).run(
      req.user!.userId, name, String(body.track_key ?? '').trim(),
      JSON.stringify(season), JSON.stringify(styles), JSON.stringify(images),
      level, String(body.path ?? '').trim(), JSON.stringify(points), isPublic,
    )

    res.json({ success: true, data: decorate(getTheme(Number(result.lastInsertRowid)), req.user!.userId) })
  } catch (err: any) {
    console.error('[themes] create error:', err.message)
    res.status(500).json({ success: false, error: '上传主题失败' })
  }
})

// PATCH /api/themes/:id  更新自己的主题（公开/私有切换、字段修改）；管理员可改全局主题
themeLibraryRouter.patch('/:id', (req: AuthRequest, res) => {
  try {
    const row = getTheme(idNum(req.params.id))
    if (!row) {
      res.status(404).json({ success: false, error: '主题不存在' })
      return
    }
    if (row.owner_user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: '仅可修改自己上传的主题' })
      return
    }

    const body = req.body || {}
    const sets: string[] = []
    const vals: any[] = []

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) {
        res.status(400).json({ success: false, error: '主题名称不能为空' })
        return
      }
      sets.push('name = ?'); vals.push(name)
    }
    if (body.track_key !== undefined) { sets.push('track_key = ?'); vals.push(String(body.track_key).trim()) }
    if (body.season !== undefined) {
      sets.push('season = ?')
      vals.push(JSON.stringify(sanitizeStringArray(body.season, 4).filter((s) => VALID_SEASONS.includes(s))))
    }
    if (body.styles !== undefined) {
      sets.push('styles = ?'); vals.push(JSON.stringify(sanitizeStringArray(body.styles, 3)))
    }
    if (body.images !== undefined) {
      const images = sanitizeImages(body.images)
      if (images.length === 0) {
        res.status(400).json({ success: false, error: '至少保留 1 张主题图片' })
        return
      }
      sets.push('images = ?'); vals.push(JSON.stringify(images))
    }
    if (body.level !== undefined && VALID_LEVELS.includes(body.level)) { sets.push('level = ?'); vals.push(body.level) }
    if (body.path !== undefined) { sets.push('path = ?'); vals.push(String(body.path).trim()) }
    if (body.points !== undefined) {
      sets.push('points = ?'); vals.push(JSON.stringify(sanitizeStringArray(body.points, 10)))
    }
    if (body.is_public !== undefined) {
      // 全局主题天然全可见，公开标记只对用户主题有意义
      sets.push('is_public = ?')
      vals.push(body.is_public === true || body.is_public === 1 ? 1 : 0)
    }
    if (sets.length === 0) {
      res.status(400).json({ success: false, error: '无更新字段' })
      return
    }

    db.prepare(`UPDATE sg_themes SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...vals, row.id)
    res.json({ success: true, data: decorate(getTheme(row.id), req.user!.userId) })
  } catch (err: any) {
    console.error('[themes] update error:', err.message)
    res.status(500).json({ success: false, error: '更新主题失败' })
  }
})

// DELETE /api/themes/:id  删除自己的主题（管理员可删任意）；收藏随外键级联清理
themeLibraryRouter.delete('/:id', (req: AuthRequest, res) => {
  try {
    const row = getTheme(idNum(req.params.id))
    if (!row) {
      res.status(404).json({ success: false, error: '主题不存在' })
      return
    }
    if (row.owner_user_id !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: '仅可删除自己上传的主题' })
      return
    }
    db.transaction(() => {
      db.prepare(`DELETE FROM sg_theme_favorites WHERE theme_id = ?`).run(row.id)
      db.prepare(`DELETE FROM sg_themes WHERE id = ?`).run(row.id)
    })()
    res.json({ success: true, data: { id: row.id } })
  } catch (err: any) {
    console.error('[themes] delete error:', err.message)
    res.status(500).json({ success: false, error: '删除主题失败' })
  }
})

// POST /api/themes/:id/favorite  收藏 / 取消收藏（切换）
themeLibraryRouter.post('/:id/favorite', (req: AuthRequest, res) => {
  try {
    const row = getTheme(idNum(req.params.id))
    if (!row) {
      res.status(404).json({ success: false, error: '主题不存在' })
      return
    }
    const userId = req.user!.userId
    const existing = db.prepare(`SELECT 1 AS one FROM sg_theme_favorites WHERE user_id = ? AND theme_id = ?`).get(userId, row.id)
    db.transaction(() => {
      if (existing) {
        db.prepare(`DELETE FROM sg_theme_favorites WHERE user_id = ? AND theme_id = ?`).run(userId, row.id)
      } else {
        db.prepare(`INSERT OR IGNORE INTO sg_theme_favorites (user_id, theme_id) VALUES (?, ?)`).run(userId, row.id)
      }
      db.prepare(`UPDATE sg_themes SET favorite_count = (SELECT COUNT(*) FROM sg_theme_favorites WHERE theme_id = ?) WHERE id = ?`)
        .run(row.id, row.id)
    })()
    const after = db.prepare(`SELECT favorite_count FROM sg_themes WHERE id = ?`).get(row.id) as any
    res.json({ success: true, data: { is_favorited: !existing, favorite_count: after?.favorite_count ?? 0 } })
  } catch (err: any) {
    console.error('[themes] favorite error:', err.message)
    res.status(500).json({ success: false, error: '收藏操作失败' })
  }
})
