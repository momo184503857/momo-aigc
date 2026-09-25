/**
 * Reliable cross-origin image download helper.
 *
 * Browsers ignore the `download` attribute on <a> tags when the href is
 * cross-origin, opening a new tab instead. This utility tries to reuse
 * original response bytes via HTTP cache, then falls back to a server proxy
 * and finally a new tab. Never re-encode DOM pixels or download a thumbnail.
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

export async function downloadUrl(url: string, filename: string): Promise<void> {
  if (!isOssImageUrl(url)) {
    throw new Error('结果图片尚未转存完成，无法下载')
  }

  // ── 1) Cached fetch — use browser HTTP cache populated by the <img> tag ──
  // `force-cache` returns the cached response even if stale, avoiding a
  // network round-trip for images that were already displayed on the page.
  try {
    const resp = await fetch(url, { cache: 'force-cache' })
    if (resp.ok) {
      const blob = await resp.blob()
      const fromCache = resp.headers.get('X-Cache') || (resp.redirected ? 'redirected' : 'unknown')
      console.log('[下载] ⚡ 策略1: HTTP缓存', { size: blob.size, fromCache, filename })
      triggerSave(blob, filename)
      return
    }
  } catch {
    // Cache miss or network failure — try via server proxy
  }

  // ── 2) Server proxy — POST /api/proxy/image, bypasses CORS ──
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
    console.log('[下载] ✅ 策略2: 服务端代理完成', { size: blob.size, filename })
    triggerSave(blob, filename)
    return
  } catch {
    // Proxy also failed
  }

  // ── 3) Last resort — open in new tab ──
  console.log('[下载] ❌ 前两层全部失败，打开新标签页')
  window.open(url, '_blank')
}
