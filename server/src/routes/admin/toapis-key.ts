import { Router } from 'express'
import { db } from '../../db/index.js'
import { authMiddleware, AuthRequest } from '../../middleware/auth.js'
import { adminMiddleware } from '../../middleware/admin.js'
import { getKey, testConnection, getBalance, getUserBalance } from '../../utils/toapis.js'

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

// Check ToAPIs token balance (current API Key)
adminToapisKeyRouter.get('/balance', async (_req: AuthRequest, res) => {
  try {
    const result = await getBalance()
    db.prepare(`
      INSERT INTO toapis_balance_history (balance, currency, raw_response, checked_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(result.balance, result.currency, JSON.stringify(result))
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.json({ success: false, error: e.message })
  }
})

// Check ToAPIs user balance (entire account)
adminToapisKeyRouter.get('/user-balance', async (_req: AuthRequest, res) => {
  try {
    const result = await getUserBalance()
    res.json({ success: true, data: result })
  } catch (e: any) {
    res.json({ success: false, error: e.message })
  }
})

// Balance check history
adminToapisKeyRouter.get('/balance/history', (_req: AuthRequest, res) => {
  const rows = db.prepare(`
    SELECT * FROM toapis_balance_history ORDER BY checked_at DESC LIMIT 30
  `).all()
  res.json({ success: true, data: rows })
})
