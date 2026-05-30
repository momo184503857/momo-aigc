import { Router } from 'express'
import multer from 'multer'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { generateOssUploadToken, importResultToOss, uploadToOss } from '../utils/oss.js'
import crypto from 'crypto'

export const ossRouter = Router()

ossRouter.post('/upload-token', authMiddleware, (req: AuthRequest, res) => {
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
    scope: scope === 'templates' ? 'templates' : 'inputs',
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
    const result = await importResultToOss({
      userId: req.user!.userId,
      taskId: String(taskId),
      sourceUrl: String(sourceUrl),
    })
    res.json({ success: true, data: result })
  } catch (err: any) {
    console.error('OSS result import error:', err.message)
    res.status(502).json({ success: false, error: err.message })
  }
})

// Multer memory storage — keep file in buffer for OSS upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
})

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

  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()
  const ext = (file.originalname.split('.').pop() || 'png')
  const objectKey = `templates/${req.user!.userId}/${yyyy}/${mm}/${uuid}.${ext}`

  try {
    console.log('Uploading to OSS:', objectKey, 'size:', file.buffer.length, 'type:', file.mimetype)
    const publicUrl = await uploadToOss(file.buffer, objectKey, file.mimetype)
    console.log('OSS upload success:', publicUrl)
    res.json({ success: true, data: { objectKey, publicUrl } })
  } catch (err: any) {
    console.error('OSS upload error:', err.message, err.stack)
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

  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()
  const ext = (file.originalname.split('.').pop() || 'png')
  const objectKey = `templates/${req.user!.userId}/${yyyy}/${mm}/${uuid}.${ext}`

  try {
    const publicUrl = await uploadToOss(file.buffer, objectKey, file.mimetype)
    res.json({
      success: true,
      data: { objectKey, publicUrl, ossBucket: '', uploadUrl: '', fields: {} },
    })
  } catch (err: any) {
    console.error('OSS upload error:', err)
    res.status(500).json({ success: false, error: '文件上传失败: ' + err.message })
  }
})
