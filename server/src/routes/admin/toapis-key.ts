import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { getKey, testConnection } from '../../utils/toapis.js'

export const adminToapisKeyRouter = Router()

adminToapisKeyRouter.use(authMiddleware, adminMiddleware)

// Get config: whether shared key is configured
adminToapisKeyRouter.get('/config', (_req: AuthRequest, res) => {
  const key = getKey()
  const sharedKeyConfigured = !!key
  const maskedKey = key ? key.slice(0, 8) + '****' + key.slice(-4) : ''
  res.json({ success: true, data: { sharedKeyConfigured, maskedKey } })
})

// Update api key
adminToapisKeyRouter.put('/config', (req: AuthRequest, res) => {
  const { apiKey } = req.body

  if (apiKey !== undefined) {
    db.prepare(`UPDATE system_config SET value = ? WHERE key = 'toapis_api_key'`).run(apiKey)
  }

  const key = getKey()
  const sharedKeyConfigured = !!key
  res.json({ success: true, data: { sharedKeyConfigured } })
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
