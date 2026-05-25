import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { getKey, getKeyMode, testConnection } from '../../utils/toapis.js'

export const adminToapisKeyRouter = Router()

adminToapisKeyRouter.use(authMiddleware, adminMiddleware)

// Get config: mode + whether shared key is configured
adminToapisKeyRouter.get('/config', (_req: AuthRequest, res) => {
  const mode = getKeyMode()
  const sharedKeyConfigured = mode === 'shared' && !!getKey()
  const maskedKey = getKey() ? getKey().slice(0, 8) + '****' + getKey().slice(-4) : ''
  res.json({ success: true, data: { mode, sharedKeyConfigured, maskedKey } })
})

// Update mode and/or api key
adminToapisKeyRouter.put('/config', (req: AuthRequest, res) => {
  const { mode, apiKey } = req.body

  if (mode !== undefined) {
    if (!['user', 'shared'].includes(mode)) {
      res.status(400).json({ success: false, error: 'mode must be "user" or "shared"' })
      return
    }
    db.prepare(`UPDATE system_config SET value = ? WHERE key = 'key_mode'`).run(mode)
  }

  if (apiKey !== undefined) {
    db.prepare(`UPDATE system_config SET value = ? WHERE key = 'toapis_api_key'`).run(apiKey)
  }

  const newMode = getKeyMode()
  const newConfigured = newMode === 'shared' && !!getKey()
  res.json({ success: true, data: { mode: newMode, sharedKeyConfigured: newConfigured } })
})

// Delete shared key
adminToapisKeyRouter.delete('/key', (_req: AuthRequest, res) => {
  db.prepare(`UPDATE system_config SET value = '' WHERE key = 'toapis_api_key'`).run()
  res.json({ success: true })
})

// Test connection with given key
adminToapisKeyRouter.post('/test', async (req: AuthRequest, res) => {
  const { apiKey } = req.body
  if (!apiKey) {
    res.status(400).json({ success: false, error: 'API Key is required' })
    return
  }
  try {
    const ok = await testConnection(apiKey)
    res.json({ success: true, data: { ok } })
  } catch (e: any) {
    res.json({ success: true, data: { ok: false, error: e.message } })
  }
})
