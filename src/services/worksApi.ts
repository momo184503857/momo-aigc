import http from './http'

// 结构化提示词六层字段
export interface PromptSegments {
  subject?: string
  style?: string
  scene?: string
  lighting?: string
  composition?: string
  quality?: string
}

export interface WorkAuthor {
  id: number
  username: string
  nickname: string | null
}

export interface WorkTag {
  id: number
  name: string
}

export interface WorkItem {
  id: string
  user_id: number
  title: string
  description: string
  image_url: string
  thumb_url: string
  prompt: string
  user_prompt: string
  prompt_segments: PromptSegments
  negative_prompt: string
  model: string
  resolution: string
  aspect_ratio: string
  feature_id: string | null
  reference_image_urls: string[]
  source_task_id: number | null
  status: string
  is_official: boolean
  like_count: number
  favorite_count: number
  reuse_count: number
  view_count: number
  created_at: string
  author: WorkAuthor | null
  tags: WorkTag[]
  is_liked: boolean
  is_favorited: boolean
}

export interface WorkListParams {
  page?: number
  pageSize?: number
  sort?: 'latest' | 'hot' | 'most_reused'
  feature_id?: string
  tag_id?: number
  keyword?: string
  scope?: 'gallery' | 'mine' | 'favorites'
}

export const worksApi = {
  list(params?: WorkListParams) {
    return http.get('/works', { params })
  },
  detail(id: string) {
    return http.get(`/works/${id}`)
  },
  publish(data: { source_task_id: number; title?: string; description?: string; tagIds?: number[] }) {
    return http.post('/works', data)
  },
  like(id: string) {
    return http.post(`/works/${id}/like`)
  },
  favorite(id: string) {
    return http.post(`/works/${id}/favorite`)
  },
  reuse(id: string) {
    return http.post(`/works/${id}/reuse`)
  },
  delete(id: string) {
    return http.delete(`/works/${id}`)
  },
  tags() {
    return http.get('/works/tags')
  },
}

// 管理员作品 API
export const adminWorksApi = {
  list(params?: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    return http.get('/admin/works', { params })
  },
  updateStatus(id: string, status: 'published' | 'hidden') {
    return http.patch(`/admin/works/${id}/status`, { status })
  },
  delete(id: string) {
    return http.delete(`/admin/works/${id}`)
  },
  publishOfficial(data: {
    title: string
    description?: string
    image_url: string
    prompt: string
    user_prompt?: string
    prompt_segments?: PromptSegments
    negative_prompt?: string
    model: string
    resolution?: string
    aspect_ratio?: string
    feature_id?: string
    reference_image_urls?: string[]
    tagIds?: number[]
  }) {
    return http.post('/admin/works/official', data)
  },
  tags() {
    return http.get('/admin/works/tags')
  },
  createTag(name: string) {
    return http.post('/admin/works/tags', { name })
  },
  deleteTag(id: number) {
    return http.delete(`/admin/works/tags/${id}`)
  },
}
