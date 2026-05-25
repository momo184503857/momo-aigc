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
}

export const templateApi = {
  list() {
    return http.get('/templates')
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
}
