import http from './http'

export interface BuyerShowTag {
  id: number
  name: string
  usage_count: number
  created_at: string
}

export interface BuyerShowMaterial {
  id: number
  public_url: string
  prompt: string
  width?: number
  height?: number
  original_filename?: string
  size_bytes?: number
  created_by?: number
  username?: string
  created_at: string
  tags: { id: number; name: string }[]
}

export interface ListBuyerShowParams {
  page?: number
  pageSize?: number
  tagId?: number
}

export interface BatchCreateItem {
  oss_bucket: string
  oss_object_key: string
  public_url: string
  prompt: string
  original_filename?: string
  mime_type?: string
  size_bytes?: number
  width?: number
  height?: number
  tagIds?: number[]
}

export interface UpdateBuyerShowParams {
  prompt?: string
  tagIds?: number[]
  image?: {
    oss_bucket: string
    oss_object_key: string
    public_url: string
    original_filename?: string
    mime_type?: string
    size_bytes?: number
    width?: number
    height?: number
  }
}

// 只读（任意登录用户）
export const buyerShowApi = {
  list(params?: ListBuyerShowParams) {
    return http.get('/buyer-show', { params })
  },
  listTags() {
    return http.get('/buyer-show/tags')
  },
}

// 管理员 CRUD
export const adminBuyerShowApi = {
  list(params?: ListBuyerShowParams) {
    return http.get('/admin/buyer-show', { params })
  },
  listTags() {
    return http.get('/admin/buyer-show/tags')
  },
  createTag(name: string) {
    return http.post('/admin/buyer-show/tags', { name })
  },
  deleteTag(id: number) {
    return http.delete(`/admin/buyer-show/tags/${id}`)
  },
  batchCreate(items: BatchCreateItem[]) {
    return http.post('/admin/buyer-show/batch', { items })
  },
  update(id: number, data: UpdateBuyerShowParams) {
    return http.patch(`/admin/buyer-show/${id}`, data)
  },
  batchDelete(ids: number[]) {
    // axios DELETE 带 body 需走 data 字段
    return http.delete('/admin/buyer-show/batch', { data: { ids } })
  },
}
