import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { diagnostics, diagnosticFetch as fetch } from '../utils/diagnostics.js'

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
    const hostname = new URL(String(url)).hostname
    if (!hostname.endsWith('.aliyuncs.com')) {
      res.status(400).json({ success: false, error: '仅允许下载 OSS 图片' })
      return
    }
  } catch {
    res.status(400).json({ success: false, error: '无效的图片 URL' })
    return
  }

  const end = diagnostics.begin('image_proxy')
  let bytes = 0
  let failure: unknown
  const onClientClose = () => {
    if (!res.writableFinished) end(new DOMException('Client disconnected', 'AbortError'), { bytes })
  }
  res.once('close', onClientClose)
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) {
      end(new Error('http_error'), { httpStatus: resp.status })
      res.status(502).json({ success: false, error: `下载失败: HTTP ${resp.status}` })
      return
    }

    const contentType = resp.headers.get('content-type') || 'image/png'
    res.set('Content-Type', contentType)
    res.set('Cache-Control', 'no-store')

    // Stream the response body instead of buffering entirely in memory
    if (resp.body) {
      const reader = resp.body.getReader()
      let clientDisconnected = false

      res.on('close', () => {
        if (!res.writableEnded) {
          clientDisconnected = true
          void reader.cancel()
        }
      })

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) { res.end(); return }
          if (clientDisconnected) return
          bytes += value.byteLength
          if (!res.write(value)) {
            // Back-pressure: wait for drain
            await new Promise<void>((resolve) => res.once('drain', resolve))
          }
        }
      }
      await pump()
    } else {
      // Fallback: no stream support
      const buffer = Buffer.from(await resp.arrayBuffer())
      bytes = buffer.length
      res.send(buffer)
    }
  } catch (err: any) {
    failure = err
    console.error('Proxy image error:', err.message)
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: '图片下载失败: ' + err.message })
    }
  } finally {
    res.off('close', onClientClose)
    end(failure, { bytes })
  }
})
