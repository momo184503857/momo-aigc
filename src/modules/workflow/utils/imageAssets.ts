/**
 * 画布节点共享的图片资产工具：收集上游图片 + URL 规整。
 *
 * 上游 Image 结果存在两种历史形态（image-input/image-ai 输出 {image, imageList} 包装；
 * 某些旧节点可能直接输出裸 asset），收集时统一兼容。
 */
import type { LocalImageAsset } from '@/modules/workflow/types/workflow'

export function isLocalImageAsset(value: unknown): value is LocalImageAsset {
  if (!value || typeof value !== 'object') return false
  const asset = value as Record<string, unknown>
  return (
    typeof asset.id === 'string' &&
    typeof asset.fileName === 'string' &&
    typeof asset.localPath === 'string' &&
    typeof asset.previewUrl === 'string'
  )
}

/** 从一个输入端口的值里收集全部图片（兼容裸 asset 与 {image, imageList} 包装，去重保序） */
export function collectImageAssets(inputValue: unknown): LocalImageAsset[] {
  if (!inputValue || typeof inputValue !== 'object') return []
  const value =
    'result' in (inputValue as Record<string, unknown>)
      ? (inputValue as { result?: { value?: unknown } }).result?.value
      : inputValue
  if (!value) return []
  if (isLocalImageAsset(value)) return [value]

  const obj = value as Record<string, unknown>
  const assets: LocalImageAsset[] = []
  const push = (item: unknown) => {
    if (isLocalImageAsset(item) && !assets.some((a) => a.id === item.id)) assets.push(item)
  }
  push(obj.image)
  if (Array.isArray(obj.imageList)) obj.imageList.forEach(push)
  return assets
}

/** 图片资产的可访问 URL（previewUrl 优先）；data:/http(s)//api/files/ 均合法 */
export function assetUrl(asset: LocalImageAsset): string {
  return asset.previewUrl || asset.localPath
}

/** URL 是否为可直接传给后端 canvas-ai imageUrls 的形态（data: 与 http(s)/站内相对路径均可） */
export function isUsableImageUrl(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('http') || url.startsWith('/api/files/')
}
