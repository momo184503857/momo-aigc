import http from './http'
import type { ModuleType } from '@/utils/promptAssembler'

/** 提示词模块定义 */
export interface PromptModule {
  id: number
  name: string
  type: ModuleType
  sort_order: number
  is_system: boolean
}

export interface PromptCardAuthor {
  id: number
  username: string
  nickname: string | null
}

/** 提示词卡片（社区库） */
export interface PromptCardItem {
  id: string
  user_id: number
  module_id: number | null
  module: { id: number; name: string; type: ModuleType } | null
  content: string
  images: string[]
  cover_url: string
  cover_index: number
  remark: string
  status: string
  is_official: boolean
  like_count: number
  favorite_count: number
  reuse_count: number
  created_at: string
  author: PromptCardAuthor | null
  is_liked: boolean
  is_favorited: boolean
}

export interface PromptCardListParams {
  page?: number
  pageSize?: number
  sort?: 'latest' | 'hot' | 'most_reused'
  moduleId?: number
  keyword?: string
  scope?: 'gallery' | 'mine' | 'favorites'
}

/** 复用接口返回：模块信息 + 内容 + 复用计数 */
export interface PromptCardReuseResult {
  id: string
  module_id: number | null
  module_name: string
  module_type: ModuleType
  content: string
  reuse_count: number
}

export const promptCardsApi = {
  list(params?: PromptCardListParams) {
    return http.get('/prompt-cards', { params })
  },
  detail(id: string) {
    return http.get(`/prompt-cards/${id}`)
  },
  create(data: { module_id: number; content: string; images: string[]; cover_index?: number; remark?: string }) {
    return http.post('/prompt-cards', data)
  },
  like(id: string) {
    return http.post(`/prompt-cards/${id}/like`)
  },
  favorite(id: string) {
    return http.post(`/prompt-cards/${id}/favorite`)
  },
  reuse(id: string) {
    return http.post(`/prompt-cards/${id}/reuse`)
  },
  delete(id: string) {
    return http.delete(`/prompt-cards/${id}`)
  },
  /** 模块列表（用户端只读，用于上传/筛选下拉） */
  modules() {
    return http.get('/prompt-cards/modules')
  },
}

/** 管理端模块 CRUD */
export const adminPromptModulesApi = {
  list() {
    return http.get('/admin/prompt-modules')
  },
  create(data: { name: string; sort_order?: number }) {
    return http.post('/admin/prompt-modules', data)
  },
  update(id: number, data: { name?: string; sort_order?: number }) {
    return http.patch(`/admin/prompt-modules/${id}`, data)
  },
  delete(id: number) {
    return http.delete(`/admin/prompt-modules/${id}`)
  },
}
