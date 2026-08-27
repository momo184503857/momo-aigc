import { Router } from 'express'
import multer from 'multer'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { generateOssUploadToken } from '../utils/oss.js'
import { saveImage, importResultFromUrl, type StorageScope } from '../utils/storage.js'
import { getStorageConfig } from '../utils/storageConfig.js'

export const ossRouter = Router()

// GET /api/oss/mode —— 前端上传统一分流依据（direct=POST /api/oss/upload；oss=PostObject 直传）
ossRouter.get('/mode', authMiddleware, (_req, res) => {
  const cfg = getStorageConfig()
  const ossHost = cfg.oss.bucket && cfg.oss.endpoint ? `${cfg.oss.bucket}.${cfg.oss.endpoint}` : ''
  res.json({ success: true, data: { mode: cfg.mode, ossHost } })
})

ossRouter.post('/upload-token', authMiddleware, (req: AuthRequest, res) => {
  const cfg = getStorageConfig()
  if (cfg.mode === 'direct') {
    res.status(400).json({ success: false, error: '当前为直接传模式，请改用 POST /api/oss/upload 上传' })
    return
  }

  const { filename, mimeType, sizeBytes, scope } = req.body || {}

  if (!filename || !mimeType) {
    res.status(400).json({ success: false, error: '缺少文件名或文件类型' })
    return
  }

  const token = generateOssUploadToken({
    userId: req.user!.userId,
    filename: String(filename),
    mimeType: String(mimeType),
    sizeBytes: Number(sizeBytes) || 10 * 1024 * 1024,
    scope: scope === 'templates' ? 'templates' : scope === 'materials' ? 'materials' : 'inputs',
  })

  res.json({ success: true, data: token })
})

ossRouter.post('/import-result', authMiddleware, async (req: AuthRequest, res) => {
  const { taskId, sourceUrl } = req.body || {}

  if (!taskId || !sourceUrl) {
    res.status(400).json({ success: false, error: '缺少任务 ID 或结果图 URL' })
    return
  }

  try {
    const result = await importResultFromUrl({
      userId: req.user!.userId,
      taskNo: String(taskId),
      sourceUrl: String(sourceUrl),
    })
    res.json({ success: true, data: { objectKey: result.objectKey, publicUrl: result.url } })
  } catch (err: any) {
    console.error('Result import error:', err.message)
    res.status(502).json({ success: false, error: err.message })
  }
})

// Multer memory storage — 直接传模式落盘 / OSS 模式服务端转传，文件字节不持久驻留内存
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
})

function normalizeScope(scope: unknown): StorageScope {
  return scope === 'templates' ? 'templates' : scope === 'materials' ? 'materials' : scope === 'results' ? 'results' : 'inputs'
}

ossRouter.post('/upload', authMiddleware, (req: AuthRequest, res, next) => {
  upload.single('file')(req as any, res as any, (err: any) => {
    if (err) {
      console.error('Multer error:', err)
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
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ success: false, error: '请选择文件' })
    return
  }
  const scope = normalizeScope((req.body as any)?.scope)

  try {
    console.log(`Uploading file (scope=${scope}):`, file.originalname, 'size:', file.buffer.length, 'type:', file.mimetype)
    const stored = await saveImage({
      scope,
      userId: req.user!.userId,
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/png',
      ext: file.originalname.split('.').pop(),
    })
    console.log('Upload success:', stored.url)
    res.json({ success: true, data: { objectKey: stored.objectKey, publicUrl: stored.url, ossBucket: stored.bucket } })
  } catch (err: any) {
    console.error('Upload error:', err.message, err.stack)
    res.status(500).json({ success: false, error: '文件上传失败: ' + err.message })
  }
})

// Keep old endpoint for compatibility (returns old-format token response, deprecated)
ossRouter.post('/upload-token-legacy', authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ success: false, error: '请选择文件' })
    return
  }

  try {
    const stored = await saveImage({
      scope: 'templates',
      userId: req.user!.userId,
      buffer: file.buffer,
      mimeType: file.mimetype || 'image/png',
      ext: file.originalname.split('.').pop(),
    })
    res.json({
      success: true,
      data: { objectKey: stored.objectKey, publicUrl: stored.url, ossBucket: stored.bucket, uploadUrl: '', fields: {} },
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    res.status(500).json({ success: false, error: '文件上传失败: ' + err.message })
  }
})
