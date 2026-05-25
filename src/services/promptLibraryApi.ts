import http from './http'

export interface PromptLibraryItem {
  id: string
  name: string
  content: string
  tags: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export const promptLibraryApi = {
  list() {
    return http.get('/prompts')
  },
  create(data: { name: string; content: string; tags?: string[] }) {
    return http.post('/prompts', data)
  },
  update(id: string, data: { name?: string; content?: string; tags?: string[] }) {
    return http.patch(`/prompts/${id}`, data)
  },
  delete(id: string) {
    return http.delete(`/prompts/${id}`)
  },
}
