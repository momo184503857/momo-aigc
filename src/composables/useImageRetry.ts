/**
 * 图片加载失败时自动重试一次（给 src 追加时间戳绕过浏览器缓存）。
 *
 * 用途：兜底偶发的网络抖动 / 旧的失败响应被缓存导致 <img> 裂开。
 * 注意：它对 CORS 失效无能为力——CORS 被拒后重发同样会失败，
 * CORS 问题应通过移除 `crossorigin="anonymous"` 解决，而非重试。
 *
 * 每张 URL 最多重试一次，避免失败死循环。
 */
export function useImageRetry() {
  const retried = new Set<string>()

  function retryOnError(e: Event, url?: string) {
    if (!url || retried.has(url)) return
    const img = e.target as HTMLImageElement | null
    if (!img) return
    retried.add(url)
    const sep = url.includes('?') ? '&' : '?'
    img.src = `${url}${sep}_t=${Date.now()}`
  }

  return { retryOnError }
}
