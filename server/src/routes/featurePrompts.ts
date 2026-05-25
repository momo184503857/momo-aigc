import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { adminMiddleware } from '../middleware/admin.js'

interface FeaturePromptRow {
  id: number
  feature_id: string
  model_id: string
  system_prompt: string
  user_prompt_label: string
  user_prompt_placeholder: string
  created_at: string
  updated_at: string
}

// ───── Public Router (no auth) ─────
export const featurePromptsRouter = Router()

// GET /api/feature-prompts/:featureId
// Returns all model prompts for a feature
featurePromptsRouter.get('/:featureId', (_req, res) => {
  const { featureId } = _req.params
  const rows = db.prepare(
    'SELECT * FROM feature_prompts WHERE feature_id = ? ORDER BY model_id'
  ).all(featureId) as FeaturePromptRow[]

  res.json({ success: true, data: rows })
})

// ───── Admin Router (auth + admin) ─────
export const adminFeaturePromptsRouter = Router()
adminFeaturePromptsRouter.use(authMiddleware, adminMiddleware)

// GET /api/admin/feature-prompts
// List all feature prompts
adminFeaturePromptsRouter.get('/', (_req: AuthRequest, res) => {
  const rows = db.prepare(
    'SELECT * FROM feature_prompts ORDER BY feature_id, model_id'
  ).all() as FeaturePromptRow[]

  res.json({ success: true, data: rows })
})

// PATCH /api/admin/feature-prompts/:id
adminFeaturePromptsRouter.patch('/:id', (req: AuthRequest, res) => {
  const { id } = req.params
  const { system_prompt, user_prompt_label, user_prompt_placeholder } = req.body

  const existing = db.prepare('SELECT * FROM feature_prompts WHERE id = ?').get(id) as FeaturePromptRow | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: '记录不存在' })
    return
  }

  const fields: string[] = []
  const params: any[] = []

  if (system_prompt !== undefined) {
    fields.push('system_prompt = ?')
    params.push(system_prompt)
  }
  if (user_prompt_label !== undefined) {
    fields.push('user_prompt_label = ?')
    params.push(user_prompt_label)
  }
  if (user_prompt_placeholder !== undefined) {
    fields.push('user_prompt_placeholder = ?')
    params.push(user_prompt_placeholder)
  }

  if (fields.length === 0) {
    res.status(400).json({ success: false, error: '无更新字段' })
    return
  }

  fields.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)

  db.prepare(`UPDATE feature_prompts SET ${fields.join(', ')} WHERE id = ?`).run(...params)

  const updated = db.prepare('SELECT * FROM feature_prompts WHERE id = ?').get(id)
  res.json({ success: true, data: updated })
})
