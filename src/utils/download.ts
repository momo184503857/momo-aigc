/**
 * Reliable cross-origin image download helper.
 *
 * Browsers ignore the `download` attribute on <a> tags when the href is
 * cross-origin, opening a new tab instead. This utility fetches the image
 * as a blob first (creating a same-origin blob URL), which triggers a
 * real download. Falls back to the server proxy if the direct fetch is
 * blocked by CORS, and as a last resort opens the URL in a new tab.
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

export async function downloadUrl(url: string, filename: string): Promise<void> {
  // 1) Direct fetch — works for same-origin or CORS-enabled URLs (e.g. OSS)
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    triggerSave(blob, filename)
    return
  } catch {
    // CORS error or network failure — try via server proxy
  }

  // 2) Server proxy — POST /api/proxy/image, bypasses CORS entirely
  try {
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
    triggerSave(blob, filename)
    return
  } catch {
    // Proxy also failed
  }

  // 3) Last resort — open in new tab (better than silently failing)
  window.open(url, '_blank')
}
