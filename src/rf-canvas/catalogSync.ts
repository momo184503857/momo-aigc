/**
 * 模型目录的同步镜像：节点端口计算（同步）需要 maxReferenceImages，
 * 目录本身由面板异步拉取（api.fetchImageCatalog），拉到后回填此处。
 */
import type { ImageCatalogModel } from './types'
import { fetchImageCatalog } from './api'

let mirror: ImageCatalogModel[] = []
let loading: Promise<void> | null = null

export function getCachedImageCatalog(): ImageCatalogModel[] {
  return mirror
}

/** 面板/运行前调用：确保目录可用（60s 缓存由 api 层控制） */
export function ensureImageCatalog(): Promise<void> {
  if (mirror.length) return Promise.resolve()
  if (!loading) {
    loading = fetchImageCatalog()
      .then((models) => {
        mirror = models
      })
      .catch((err) => {
        console.warn('[rf-canvas] 生图目录加载失败:', err)
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
}
