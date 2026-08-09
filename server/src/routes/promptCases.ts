import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'

// ────────────────────────────────────────────────────────────
//  提示词参考案例库
//  官方预生成案例（prompt_cases 表）+ 作品库聚合（works 中带结构化字段的作品）。
//  让用户「看图选词」：点某字段（如光影）-> 看该字段关键词的参考图 -> 一键填入。
// ────────────────────────────────────────────────────────────

export const promptCasesRouter = Router()
promptCasesRouter.use(authMiddleware)

function safeParseJson(text: string | null | undefined, fallback: any): any {
  try {
    return JSON.parse(text || '{}') || fallback
  } catch {
    return fallback
  }
}

// GET /api/prompt-cases?segment=lighting&keyword=柔光
// 返回该字段下所有关键词的参考案例图（官方 + 作品聚合）
promptCasesRouter.get('/', (req, res) => {
  try {
    const segment = (req.query.segment as string) || ''
    const keyword = (req.query.keyword as string) || undefined

    if (!segment) {
      res.status(400).json({ success: false, error: '缺少 segment 参数' })
      return
    }

    const cases: any[] = []

    // 1. 官方案例（prompt_cases 表）
    let officialSql = `SELECT id, segment_key, keyword, image_url, prompt_snapshot, model, is_official FROM prompt_cases WHERE segment_key = ?`
    const officialParams: any[] = [segment]
    if (keyword) {
      officialSql += ` AND keyword = ?`
      officialParams.push(keyword)
    }
    officialSql += ` ORDER BY sort_order ASC, created_at ASC`
    const officialCases = db.prepare(officialSql).all(...officialParams) as any[]
    for (const c of officialCases) {
      cases.push({
        id: `official-${c.id}`,
        keyword: c.keyword,
        image_url: c.image_url,
        prompt_snapshot: c.prompt_snapshot,
        model: c.model,
        source: 'official',
      })
    }

    // 2. 作品聚合（works 表中 prompt_segments 里该字段非空的作品）
    // 仅查已发布作品，按点赞+复用数排序，取 top N
    if (!keyword) {
      // 无 keyword 时：聚合该字段所有出现过的关键词
      const works = db.prepare(`
        SELECT id, title, image_url, prompt_segments, like_count, reuse_count, model
        FROM works
        WHERE status = 'published'
          AND prompt_segments LIKE ?
        ORDER BY (like_count + reuse_count * 2) DESC
        LIMIT 30
      `).all(`%"${segment}"%`) as any[]

      for (const w of works) {
        const segs = safeParseJson(w.prompt_segments, {})
        const val = segs[segment]?.trim()
        if (!val) continue
        // 按 keyword 分组：val 可能含多个词（逗号分隔），取第一个作为关键词
        const kw = val.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)[0]
        if (!kw) continue
        cases.push({
          id: `community-${w.id}`,
          keyword: kw,
          image_url: w.image_url,
          prompt_snapshot: '',
          model: w.model,
          source: 'community',
          work_id: w.id,
          like_count: w.like_count,
          reuse_count: w.reuse_count,
        })
      }
    } else {
      // 有 keyword 时：精确匹配
      const works = db.prepare(`
        SELECT id, title, image_url, prompt_segments, like_count, reuse_count, model
        FROM works
        WHERE status = 'published'
          AND prompt_segments LIKE ?
        ORDER BY (like_count + reuse_count * 2) DESC
        LIMIT 12
      `).all(`%"${segment}"%`) as any[]

      for (const w of works) {
        const segs = safeParseJson(w.prompt_segments, {})
        const val = segs[segment]?.trim()
        if (!val) continue
        // 检查是否包含该 keyword
        if (!val.includes(keyword)) continue
        cases.push({
          id: `community-${w.id}`,
          keyword: val,
          image_url: w.image_url,
          prompt_snapshot: '',
          model: w.model,
          source: 'community',
          work_id: w.id,
          like_count: w.like_count,
          reuse_count: w.reuse_count,
        })
      }
    }

    res.json({ success: true, data: cases })
  } catch (err: any) {
    console.error('[prompt-cases] List error:', err.message)
    res.status(500).json({ success: false, error: '加载案例失败: ' + err.message })
  }
})
