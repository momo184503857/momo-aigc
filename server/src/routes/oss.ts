import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { generateOssUploadToken } from '../utils/oss.js'

export const ossRouter = Router()

ossRouter.post('/upload-token', authMiddleware, (req: AuthRequest, res) => {
  const { filename, mime_type, size_bytes } = req.body

  if (!filename) {
    res.status(400).json({ success: false, error: '请提供文件名' })
    return
  }

  try {
    const token = generateOssUploadToken({
      userId: req.user!.userId,
      filename,
      mimeType: mime_type || 'image/png',
      sizeBytes: size_bytes || 10485760,
    })

    res.json({ success: true, data: token })
  } catch (err: any) {
    res.status(500).json({ success: false, error: '上传凭证生成失败: ' + err.message })
  }
})
