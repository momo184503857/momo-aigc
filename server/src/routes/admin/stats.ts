import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'

export const adminStatsRouter = Router()

adminStatsRouter.use(authMiddleware, adminMiddleware)

adminStatsRouter.get('/users', (_req: AuthRequest, res) => {
  const stats = db.prepare(`
    SELECT
      u.id AS user_id,
      u.username,
      u.role,
      u.status,
      COUNT(t.id) AS submitted_count,
      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      MAX(t.created_at) AS last_submitted_at,
      MAX(CASE WHEN t.status = 'completed' THEN t.completed_at END) AS last_completed_at
    FROM users u
    LEFT JOIN generation_tasks t ON t.user_id = u.id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY submitted_count DESC
  `).all()

  res.json({ success: true, data: stats })
})
