import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getKey, uploadImage, createTask, getTaskStatus, resolveUserApiKey } from '../utils/toapis.js'

export const toapisProxyRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

toapisProxyRouter.use(authMiddleware)

// Health: 返回当前用户可用的 key 状态（共享 + 个人）
toapisProxyRouter.get('/health', (req: AuthRequest, res) => {
  const row = db.prepare(`SELECT 1 FROM user_toapis_keys WHERE user_id = ?`).get(req.user!.userId)
  const personalKeyConfigured = !!row
  const { mode } = resolveUserApiKey(req.user!.userId)
  res.json({
    success: true,
    data: {
      sharedKeyConfigured: !!getKey(),
      personalKeyConfigured,
      personalKeyActive: mode === 'personal',
    },
  })
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
    const { key } = resolveUserApiKey(req.user!.userId)
    const url = await uploadImage(file.buffer, file.originalname, file.mimetype, key)
    res.json({ success: true, data: { url } })
  } catch (e: any) {
    console.error('[ToAPIs Proxy] Upload error:', e.message)
    res.status(502).json({ success: false, error: e.message })
  }
})

// Create task (按用户当前 key 模式代理：个人 key 或共享 key)
toapisProxyRouter.post('/create-task', async (req: AuthRequest, res) => {
  try {
    const { key, mode } = resolveUserApiKey(req.user!.userId)
    if (!key) {
      res.status(400).json({ success: false, error: '未配置可用的 API Key（共享/个人均未配置）' })
      return
    }
    const taskId = await createTask(req.body, key)
    res.json({ success: true, data: { id: taskId, keyMode: mode } })
  } catch (e: any) {
    const bodySummary = {
      model: req.body?.model,
      promptLen: req.body?.prompt?.length || 0,
      imageCount: req.body?.reference_images?.length || req.body?.image_urls?.length || 0,
    }
    const errMsg = `[ToAPIs Proxy] Create task error: ${e.message} | body: ${JSON.stringify(bodySummary)}`
    console.error(errMsg)
    fs.appendFileSync('/tmp/momoaigc-debug.log', `${new Date().toISOString()} ${errMsg}\n`)
    res.status(502).json({ success: false, error: e.message })
  }
})

// Get task status (按用户当前 key 模式代理)
toapisProxyRouter.get('/task-status/:id', async (req: AuthRequest, res) => {
  try {
    const { key } = resolveUserApiKey(req.user!.userId)
    const result = await getTaskStatus(String(req.params.id), key)
    res.json({ success: true, data: result })
  } catch (e: any) {
    console.error('[ToAPIs Proxy] Status error:', e.message)
    res.status(502).json({ success: false, error: e.message })
  }
})
