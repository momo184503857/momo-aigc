import http from './http'
import type { PromptSegments } from './worksApi'

export interface PromptCase {
  id: string
  keyword: string
  image_url: string
  prompt_snapshot: string
  model: string
  source: 'official' | 'community'
  work_id?: string
  like_count?: number
  reuse_count?: number
}

export const promptCasesApi = {
  list(segment: string, keyword?: string) {
    return http.get('/prompt-cases', { params: { segment, keyword } })
  },
}

export const adminPromptCasesApi = {
  list(segment?: string) {
    return http.get('/admin/prompt-cases', { params: segment ? { segment } : {} })
  },
  create(data: {
    segment_key: string
    keyword: string
    image_url: string
    prompt_snapshot?: string
    model?: string
    sort_order?: number
  }) {
    return http.post('/admin/prompt-cases', data)
  },
  update(id: number, data: Partial<{
    segment_key: string
    keyword: string
    image_url: string
    prompt_snapshot: string
    model: string
    sort_order: number
  }>) {
    return http.patch(`/admin/prompt-cases/${id}`, data)
  },
  delete(id: number) {
    return http.delete(`/admin/prompt-cases/${id}`)
  },
}

// 复用 PromptSegments 类型，避免循环依赖
export type { PromptSegments }
