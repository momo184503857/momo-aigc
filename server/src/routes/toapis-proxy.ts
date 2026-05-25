import { Router } from 'express'
import multer from 'multer'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getKey, getKeyMode, uploadImage, createTask, getTaskStatus } from '../utils/toapis.js'

export const toapisProxyRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

toapisProxyRouter.use(authMiddleware)

// Health: returns current mode and whether shared key is configured
toapisProxyRouter.get('/health', (_req, res) => {
  const mode = getKeyMode()
  const sharedKeyConfigured = mode === 'shared' && !!getKey()
  res.json({ success: true, data: { mode, sharedKeyConfigured } })
})

// Upload image (shared mode proxy)
toapisProxyRouter.post('/upload', (req: AuthRequest, res, next) => {
  upload.single('file')(req as any, res as any, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ success: false, error: '文件大小不能超过 10MB' })
      } else {
        res.status(400).json({ success: false, error: '文件上传失败: ' + err.message })
      }
      return
    }
    next()
  })
}, async (req: AuthRequest, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) {
      res.status(400).json({ success: false, error: '未提供文件' })
      return
    }
    const url = await uploadImage(file.buffer, file.originalname, file.mimetype)
    res.json({ success: true, data: { url } })
  } catch (e: any) {
    console.error('[ToAPIs Proxy] Upload error:', e.message)
    res.status(502).json({ success: false, error: e.message })
  }
})

// Create task (shared mode proxy)
toapisProxyRouter.post('/create-task', async (req: AuthRequest, res) => {
  try {
    const taskId = await createTask(req.body)
    res.json({ success: true, data: { id: taskId } })
  } catch (e: any) {
    console.error('[ToAPIs Proxy] Create task error:', e.message)
    res.status(502).json({ success: false, error: e.message })
  }
})

// Get task status (shared mode proxy)
toapisProxyRouter.get('/task-status/:id', async (req: AuthRequest, res) => {
  try {
    const result = await getTaskStatus(String(req.params.id))
    res.json({ success: true, data: result })
  } catch (e: any) {
    console.error('[ToAPIs Proxy] Status error:', e.message)
    res.status(502).json({ success: false, error: e.message })
  }
})
