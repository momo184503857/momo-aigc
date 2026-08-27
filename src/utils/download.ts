/**
 * Reliable cross-origin image download helper.
 *
 * Browsers ignore the `download` attribute on <a> tags when the href is
 * cross-origin, opening a new tab instead. This utility tries to reuse
 * already-loaded image data first (zero network overhead), then falls back
 * to a cached fetch, a server proxy, and finally a new tab.
 */

function triggerSave(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Delay revocation so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

/** 可下载的结果图 URL：OSS 公网地址，或直接传模式的本站 /api/files/ 本地地址 */
export function isOssImageUrl(url: string): boolean {
  if (url.startsWith('/api/files/')) return true
  try {
    return new URL(url, window.location.href).hostname.endsWith('.aliyuncs.com')
  } catch {
    return false
  }
}

/**
 * Try to extract image pixel data from an already-loaded <img> element
 * in the DOM. Returns a Blob on success, or null if no loaded image was
 * found or the canvas was tainted (cross-origin without CORS).
 */
async function getImageBlobFromDom(url: string): Promise<Blob | null> {
  const targetUrl = new URL(url, window.location.href).href
  const imgs = Array.from(document.images).filter((img) => {
    const loadedUrl = img.currentSrc || img.src
    if (!loadedUrl) return false
    try {
      return new URL(loadedUrl, window.location.href).href === targetUrl
    } catch {
      return false
    }
  })
  if (imgs.length === 0) {
    console.log('[下载] 🔍 DOM中未找到匹配的<img>元素, url:', url.slice(0, 60) + '...')
    return null
  }
  for (const img of imgs) {
    if (!(img instanceof HTMLImageElement)) continue
    // Skip images that haven't finished loading yet
    if (!img.complete || img.naturalWidth === 0) continue

    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      ctx.drawImage(img, 0, 0)
      // If the image is cross-origin without CORS, the canvas is tainted
      // and the following call will throw a SecurityError.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      )
      if (blob && blob.size > 0) return blob
    } catch {
      console.log('[下载] ⚠️ Canvas被污染(跨域无CORS), 降级到HTTP缓存')
      return null
    }
  }
  return null
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
  if (!isOssImageUrl(url)) {
    throw new Error('结果图片尚未转存完成，无法下载')
  }

  // ── 1) Extract from already-loaded <img> in the DOM ──
  // Zero network overhead — reuses pixel data the browser already has.
  try {
    const domBlob = await getImageBlobFromDom(url)
    if (domBlob) {
      console.log('[下载] ✅ 策略1: 从DOM缓存提取 (零网络)', { size: domBlob.size, filename })
      triggerSave(domBlob, filename)
      return
    }
  } catch { /* fall through */ }

  // ── 2) Cached fetch — use browser HTTP cache populated by the <img> tag ──
  // `force-cache` returns the cached response even if stale, avoiding a
  // network round-trip for images that were already displayed on the page.
  try {
    const resp = await fetch(url, { cache: 'force-cache' })
    if (resp.ok) {
      const blob = await resp.blob()
      const fromCache = resp.headers.get('X-Cache') || (resp.redirected ? 'redirected' : 'unknown')
      console.log('[下载] ⚡ 策略2: HTTP缓存', { size: blob.size, fromCache, filename })
      triggerSave(blob, filename)
      return
    }
  } catch {
    // Cache miss or network failure — try via server proxy
  }

  // ── 3) Server proxy — POST /api/proxy/image, bypasses CORS ──
  try {
    console.log('[下载] 🔄 策略3: 服务端代理...')
    const token = localStorage.getItem('auth_token')
    const resp = await fetch('/api/proxy/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url }),
    })
    if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`)
    const blob = await resp.blob()
    console.log('[下载] ✅ 策略3: 服务端代理完成', { size: blob.size, filename })
    triggerSave(blob, filename)
    return
  } catch {
    // Proxy also failed
  }

  // ── 4) Last resort — open in new tab ──
  console.log('[下载] ❌ 前三层全部失败，打开新标签页')
  window.open(url, '_blank')
}
