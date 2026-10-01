export type UploadImage = (file: File) => Promise<string>

export interface StoredImageResolver {
  resolveFile(file: File): Promise<string>
  resolveUrl(url: string): Promise<string>
}

export function createStoredImageResolver(options: {
  ossHost: string
  upload: UploadImage
  fetchImage?: typeof fetch
}): StoredImageResolver {
  const fileCache = new Map<File, Promise<string>>()
  const urlCache = new Map<string, Promise<string>>()
  const fetchImage = options.fetchImage ?? fetch

  const isStored = (url: string) => url.startsWith('/api/files/')
    || (!!options.ossHost && url.includes(options.ossHost))

  const uploadFile = (file: File) => options.upload(file).catch((error) => {
    console.warn('[ImageGen] File upload failed:', error)
    throw new Error('图片上传失败，请检查网络后重试')
  })

  const resolveFile = (file: File): Promise<string> => {
    let pending = fileCache.get(file)
    if (!pending) { pending = uploadFile(file); fileCache.set(file, pending) }
    return pending
  }

  const resolveUrl = (url: string): Promise<string> => {
    if (isStored(url)) return Promise.resolve(url)
    let pending = urlCache.get(url)
    if (pending) return pending
    pending = (async () => {
      if (!url.startsWith('data:') && !url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('图片地址无效，请重新选择图片')
      }
      try {
        const response = await fetchImage(url, url.startsWith('data:') ? undefined : { signal: AbortSignal.timeout(60_000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        return await uploadFile(new File([blob], 'ref-image.png', { type: blob.type || 'image/png' }))
      } catch (error) {
        if (error instanceof Error && error.message === '图片上传失败，请检查网络后重试') throw error
        console.warn('[ImageGen] Image transfer failed:', error)
        throw new Error('图片上传失败，请检查网络后重试')
      }
    })()
    urlCache.set(url, pending)
    return pending
  }

  return { resolveFile, resolveUrl }
}
