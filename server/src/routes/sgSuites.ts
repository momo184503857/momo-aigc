/**
 * suite-gen 套系（sg_suites）路由。
 *
 * 套系 = 一次成套生成的完整单元（1 主题 × 5 点位）。本路由只管草稿与
 * 历史查询；生图由前端走现有 tasks 链路（suite_id/point_index 随任务落库），
 * 套系状态由任务实时聚合得出，避免状态不同步。
 */
import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

const JSON_FIELDS = ['track_snapshot', 'theme_snapshot', 'persona_snapshot', 'garment', 'prompt_points', 'enabled_locks']

function parseSuite(row: any, tasks: any[]): any {
  if (!row) return row
  const parsed = { ...row }
  for (const f of JSON_FIELDS) {
    if (typeof parsed[f] === 'string') {
      try { parsed[f] = JSON.parse(parsed[f]) } catch { /* keep as-is */ }
    }
  }
  if (!Array.isArray(parsed.prompt_points)) parsed.prompt_points = []
  if (!Array.isArray(parsed.enabled_locks)) parsed.enabled_locks = []
  // 任务聚合：套系状态由任务实时计算
  const active = tasks.filter((t) => t.status !== 'cancelled')
  let status = parsed.status
  if (active.length > 0) {
    const completed = active.filter((t) => t.status === 'completed').length
    const failed = active.filter((t) => t.status === 'failed').length
    const running = active.filter((t) => ['submitted', 'queued', 'in_progress'].includes(t.status)).length
    if (completed === active.length) status = 'completed'
    else if (running > 0) status = 'generating'
    else if (failed === active.length) status = 'failed'
    else status = 'partial'
  }
  const points = parsed.prompt_points.length || parsed.n_total || 5
  const pointTasks = Array.from({ length: points }, (_, i) => {
    const t = tasks.find((x) => x.point_index === i)
    if (!t) return { pointIndex: i, status: 'pending' as const, taskId: null, resultUrl: '' }
    let urls: string[] = []
    try { urls = typeof t.result_image_urls === 'string' ? JSON.parse(t.result_image_urls || '[]') : (t.result_image_urls || []) } catch { urls = [] }
    return {
      pointIndex: i,
      status: t.status,
      taskId: t.id,
      resultUrl: urls[0] || '',
    }
  })
  return {
    ...parsed,
    status,
    taskCount: active.length,
    completedCount: active.filter((t) => t.status === 'completed').length,
    failedCount: active.filter((t) => t.status === 'failed').length,
    points: pointTasks,
    tasks: tasks.map((t) => ({
      id: t.id, status: t.status, point_index: t.point_index, model: t.model,
      prompt: t.prompt, input_image_urls: (() => {
        try { return typeof t.input_image_urls === 'string' ? JSON.parse(t.input_image_urls || '[]') : (t.input_image_urls || []) } catch { return [] }
      })(),
      result_image_urls: (() => {
        try { return typeof t.result_image_urls === 'string' ? JSON.parse(t.result_image_urls || '[]') : (t.result_image_urls || []) } catch { return [] }
      })(),
      error_message: t.error_message, points_cost: t.points_cost, created_at: t.created_at,
    })),
  }
}

function getTasksBySuiteIds(suiteIds: number[]): Map<number, any[]> {
  const map = new Map<number, any[]>()
  if (suiteIds.length === 0) return map
  const placeholders = suiteIds.map(() => '?').join(', ')
  const rows = db.prepare(
    `SELECT * FROM generation_tasks WHERE suite_id IN (${placeholders}) ORDER BY point_index ASC, id ASC`
  ).all(...suiteIds) as any[]
  for (const t of rows) {
    if (!t.suite_id) continue
    const list = map.get(t.suite_id) || []
    list.push(t)
    map.set(t.suite_id, list)
  }
  return map
}

export const sgSuitesRouter = Router()
sgSuitesRouter.use(authMiddleware)

// 我的套系列表
sgSuitesRouter.get('/', (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(20, Math.max(1, parseInt(req.query.pageSize as string) || 10))
    const status = req.query.status as string | undefined
    let where = 'WHERE user_id = ?'
    const params: any[] = [req.user!.userId]
    if (status) { where += ' AND status = ?'; params.push(status) }
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM sg_suites ${where}`).get(...params) as any
    const rows = db.prepare(
      `SELECT * FROM sg_suites ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize) as any[]
    const tasksMap = getTasksBySuiteIds(rows.map((r) => r.id))
    res.json({
      success: true,
      data: {
        records: rows.map((r) => parseSuite(r, tasksMap.get(r.id) || [])),
        total: countRow.total, page, pageSize,
      },
    })
  } catch (err: any) {
    console.error('[sg-suites] list error:', err.message)
    res.status(500).json({ success: false, error: '加载套系列表失败' })
  }
})

// 套系详情
sgSuitesRouter.get('/:id', (req: AuthRequest, res) => {
  try {
    const row = db.prepare(`SELECT * FROM sg_suites WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user!.userId) as any
    if (!row) { res.status(404).json({ success: false, error: '套系不存在' }); return }
    const tasks = getTasksBySuiteIds([row.id]).get(row.id) || []
    res.json({ success: true, data: parseSuite(row, tasks) })
  } catch (err: any) {
    console.error('[sg-suites] detail error:', err.message)
    res.status(500).json({ success: false, error: '加载套系失败' })
  }
})

// 创建 / 更新草稿（带 id 则更新本人套系）
sgSuitesRouter.post('/', (req: AuthRequest, res) => {
  try {
    const b = req.body || {}
    const json = (v: unknown, d: string) => (v === undefined ? d : JSON.stringify(v ?? ''))
    const text = (v: unknown, d = '') => String(v ?? d)
    const fields = {
      name: text(b.name).slice(0, 150),
      feature_source: text(b.feature_source, 'suite'),
      track_snapshot: json(b.track_snapshot, '{}'),
      theme_snapshot: json(b.theme_snapshot, '{}'),
      persona_snapshot: json(b.persona_snapshot, '{}'),
      garment: json(b.garment, '{}'),
      prompt_common: text(b.prompt_common),
      prompt_points: json(b.prompt_points, '[]'),
      enabled_locks: json(b.enabled_locks, '[]'),
      model: text(b.model),
      resolution: text(b.resolution, '2K'),
      aspect_ratio: text(b.aspect_ratio, '3:4'),
      n_total: Math.max(1, Math.min(8, Number(b.n_total) || 5)),
    }

    if (b.id) {
      const exist = db.prepare(`SELECT id FROM sg_suites WHERE id = ? AND user_id = ?`)
        .get(b.id, req.user!.userId) as any
      if (!exist) { res.status(404).json({ success: false, error: '套系不存在' }); return }
      const cols = Object.keys(fields)
      db.prepare(
        `UPDATE sg_suites SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(...Object.values(fields), b.id)
      res.json({ success: true, data: { id: b.id } })
      return
    }

    const cols = Object.keys(fields)
    const result = db.prepare(
      `INSERT INTO sg_suites (user_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`
    ).run(req.user!.userId, ...Object.values(fields))
    res.json({ success: true, data: { id: Number(result.lastInsertRowid) } })
  } catch (err: any) {
    console.error('[sg-suites] save error:', err.message)
    res.status(500).json({ success: false, error: '保存套系失败' })
  }
})

// 重命名
sgSuitesRouter.patch('/:id/rename', (req: AuthRequest, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 150)
    if (!name) { res.status(400).json({ success: false, error: '名称不能为空' }); return }
    const result = db.prepare(
      `UPDATE sg_suites SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
    ).run(name, req.params.id, req.user!.userId)
    if (result.changes === 0) { res.status(404).json({ success: false, error: '套系不存在' }); return }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: '重命名失败' })
  }
})

// 删除：草稿物理删除；已生成套系软删除（status=archived），防误删作品关联
sgSuitesRouter.delete('/:id', (req: AuthRequest, res) => {
  try {
    const row = db.prepare(`SELECT * FROM sg_suites WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user!.userId) as any
    if (!row) { res.status(404).json({ success: false, error: '套系不存在' }); return }
    if (row.status === 'draft') {
      db.prepare(`DELETE FROM sg_suites WHERE id = ?`).run(row.id)
    } else {
      db.prepare(`UPDATE sg_suites SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id)
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: '删除套系失败' })
  }
})
