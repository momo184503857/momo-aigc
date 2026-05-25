import http from './http'

export interface CreateTemplateParams {
  name?: string
  oss_bucket: string
  oss_object_key: string
  public_url: string
  original_filename?: string
  mime_type?: string
  size_bytes?: number
  width?: number
  height?: number
  tagIds?: number[]
}

export interface ListTemplatesParams {
  page?: number
  pageSize?: number
  tagId?: number
}

export interface TemplateTag {
  id: number
  name: string
  usage_count: number
  created_at: string
}

export const templateApi = {
  list(params?: ListTemplatesParams) {
    return http.get('/templates', { params })
  },
  create(data: CreateTemplateParams) {
    return http.post('/templates', data)
  },
  rename(id: number, name: string) {
    return http.patch(`/templates/${id}`, { name })
  },
  delete(id: number) {
    return http.delete(`/templates/${id}`)
  },
  updateTags(id: number, tagIds: number[]) {
    return http.patch(`/templates/${id}/tags`, { tagIds })
  },
  listTags() {
    return http.get('/templates/tags')
  },
  createTag(name: string) {
    return http.post('/templates/tags', { name })
  },
}
