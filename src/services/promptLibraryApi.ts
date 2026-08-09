import http from './http'

export interface PromptLibraryItem {
  id: string
  user_id: number
  name: string
  content: string
  segments?: Record<string, string>
  tags: string[]
  sort_order: number
  is_starred: boolean
  created_at: string
  updated_at: string
}

export const promptLibraryApi = {
  list() {
    return http.get('/prompts')
  },
  create(data: { name: string; content: string; tags?: string[]; segments?: Record<string, string> }) {
    return http.post('/prompts', data)
  },
  update(id: string, data: { name?: string; content?: string; tags?: string[]; segments?: Record<string, string> }) {
    return http.patch(`/prompts/${id}`, data)
  },
  setFavorite(id: string, is_starred: boolean) {
    return http.patch(`/prompts/${id}/favorite`, { is_starred })
  },
  delete(id: string) {
    return http.delete(`/prompts/${id}`)
  },
}
