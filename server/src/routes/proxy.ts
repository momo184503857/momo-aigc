import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const proxyRouter = Router()

proxyRouter.use(authMiddleware)

// Proxy image download to bypass CORS restrictions on result image URLs
proxyRouter.post('/image', async (req: AuthRequest, res) => {
  const { url } = req.body
  if (!url) {
    res.status(400).json({ success: false, error: '缺少 URL 参数' })
    return
  }

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) {
      res.status(502).json({ success: false, error: `下载失败: HTTP ${resp.status}` })
      return
    }

    const contentType = resp.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await resp.arrayBuffer())

    res.set('Content-Type', contentType)
    res.set('Content-Length', String(buffer.length))
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(buffer)
  } catch (err: any) {
    console.error('Proxy image error:', err.message)
    res.status(502).json({ success: false, error: '图片下载失败: ' + err.message })
  }
})
