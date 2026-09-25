import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { adminMiddleware } from '../middleware/admin.js'
const ids = ['batch-clothes-swap', 'batch-pose-swap', 'batch-spreadsheet', 'batch-face-swap']
const keyFor = (id: string) => `toolbox_image_${id}`
export const toolboxRouter = Router()
toolboxRouter.get('/images', (_req, res) => {
  const read = db.prepare('SELECT value FROM system_config WHERE key = ?')
  const images = Object.fromEntries(ids.map(id => [id, (read.get(keyFor(id)) as { value: string } | undefined)?.value || '']))
  res.json({ success: true, data: images })
})
export const adminToolboxRouter = Router()
adminToolboxRouter.use(authMiddleware, adminMiddleware)
adminToolboxRouter.put('/images/:id', (req, res) => {
  const id = String(req.params.id)
  const imageUrl: unknown = req.body?.imageUrl
  if (!ids.includes(id)) { res.status(404).json({ success: false, error: '工具不存在' }); return }
  if (typeof imageUrl !== 'string' || imageUrl.length > 2048 || (imageUrl !== '' && !/^\/api\/files\/[^\s]+$/.test(imageUrl) && !/^https?:\/\/[^\s]+$/.test(imageUrl))) {
    res.status(400).json({ success: false, error: '图片地址无效' }); return
  }
  db.prepare('INSERT INTO system_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(keyFor(id), imageUrl)
  res.json({ success: true })
})
